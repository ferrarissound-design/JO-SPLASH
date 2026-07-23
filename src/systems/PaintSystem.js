import * as THREE from 'three';
import { PAINT, TEAM } from '../config.js';

const OWNER_NONE = 0;
const OWNER_PLAYER = 1;
const OWNER_CPU = 2;

const OWNER_BY_TEAM = { [TEAM.PLAYER]: OWNER_PLAYER, [TEAM.CPU]: OWNER_CPU };

// ============================================================================
// PaintSystem — tracks floor coverage on a lightweight grid (for gameplay
// queries: coverage %, "whose floor am I standing on") while rendering the
// actual splats onto a single CanvasTexture (for a soft, circular look
// instead of visibly blocky cells). Grid resolution and texture resolution
// are independent by design: the texture can be higher-res for smoother
// visuals without inflating the gameplay bookkeeping cost.
// ============================================================================
export class PaintSystem {
  constructor(halfWidth, halfDepth) {
    this.halfWidth = halfWidth;
    this.halfDepth = halfDepth;
    this.width = halfWidth * 2;
    this.depth = halfDepth * 2;

    this.gridRes = PAINT.gridResolution;
    this.ownerGrid = new Uint8Array(this.gridRes * this.gridRes);

    this.playerCells = 0;
    this.cpuCells = 0;
    this.totalCells = this.gridRes * this.gridRes;

    this._buildCanvasTexture();

    this._dirty = false;
    this._timeSinceUpload = 0;
  }

  _buildCanvasTexture() {
    const size = PAINT.textureSize;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#3a4150';
    this.ctx.fillRect(0, 0, size, size);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** Attach this system's texture onto a floor mesh's material. */
  applyToMaterial(material) {
    material.map = this.texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  }

  _worldToUV(x, z) {
    return [
      (x + this.halfWidth) / this.width,
      (z + this.halfDepth) / this.depth,
    ];
  }

  /** Grid cell coordinates for a world XZ position (clamped to valid range). */
  worldToGrid(x, z) {
    const [u, v] = this._worldToUV(x, z);
    const gx = THREE.MathUtils.clamp(Math.floor(u * this.gridRes), 0, this.gridRes - 1);
    const gz = THREE.MathUtils.clamp(Math.floor(v * this.gridRes), 0, this.gridRes - 1);
    return [gx, gz];
  }

  /** Returns TEAM.PLAYER, TEAM.CPU, or null (unpainted) for the cell at (x,z). */
  getOwnerAt(x, z) {
    if (Math.abs(x) > this.halfWidth || Math.abs(z) > this.halfDepth) return null;
    const [gx, gz] = this.worldToGrid(x, z);
    const v = this.ownerGrid[gz * this.gridRes + gx];
    if (v === OWNER_PLAYER) return TEAM.PLAYER;
    if (v === OWNER_CPU) return TEAM.CPU;
    return null;
  }

  /** Paint a circular splat centered at world (x,z) with the given radius, owned by `team`. */
  paintSplat(x, z, radius, team) {
    const owner = OWNER_BY_TEAM[team];
    if (!owner) return;

    this._paintGrid(x, z, radius, owner);
    this._paintCanvas(x, z, radius, team);
    this._dirty = true;
  }

  _paintGrid(x, z, radius, owner) {
    const cellWorldSize = this.width / this.gridRes;
    const cellRadius = Math.ceil(radius / cellWorldSize) + 1;
    const [cx, cz] = this.worldToGrid(x, z);
    const res = this.gridRes;
    const grid = this.ownerGrid;

    const minGx = Math.max(0, cx - cellRadius);
    const maxGx = Math.min(res - 1, cx + cellRadius);
    const minGz = Math.max(0, cz - cellRadius);
    const maxGz = Math.min(res - 1, cz + cellRadius);

    const radiusSq = radius * radius;

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        // Cell center in world space
        const cellX = -this.halfWidth + (gx + 0.5) * cellWorldSize;
        const cellZ = -this.halfDepth + (gz + 0.5) * cellWorldSize;
        const dx = cellX - x;
        const dz = cellZ - z;
        if (dx * dx + dz * dz > radiusSq) continue;

        const idx = gz * res + gx;
        const prev = grid[idx];
        if (prev === owner) continue;

        if (prev === OWNER_PLAYER) this.playerCells--;
        else if (prev === OWNER_CPU) this.cpuCells--;

        grid[idx] = owner;

        if (owner === OWNER_PLAYER) this.playerCells++;
        else if (owner === OWNER_CPU) this.cpuCells++;
      }
    }
  }

  _paintCanvas(x, z, radius, team) {
    const size = PAINT.textureSize;
    const [u, v] = this._worldToUV(x, z);
    const px = u * size;
    const py = v * size;
    const pr = (radius / this.width) * size;

    const color = team === TEAM.PLAYER ? '#2fb8ff' : '#ff7a2f';
    const glow = team === TEAM.PLAYER ? '#7fe0ff' : '#ffb06f';
    const ctx = this.ctx;

    // Draw an irregular radial polygon over the same logical circle. Gameplay
    // coverage still uses the unchanged grid circle above; this only makes the
    // CanvasTexture edge feel like liquid instead of a perfect stamp.
    const lobes = 18;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const wobble = 0.9 + Math.sin(px * 0.071 + py * 0.043 + i * 1.73) * 0.085 + Math.sin(i * 2.41 + px * 0.019) * 0.045;
      const r = pr * wobble;
      const sx = px + Math.cos(a) * r;
      const sy = py + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();

    // Brief-looking highlight baked into the texture, plus tiny splashes with
    // a fixed count (no Geometry/Material allocations) for a lighter ink feel.
    const grad = ctx.createRadialGradient(px, py, pr * 0.18, px, py, pr * 1.08);
    grad.addColorStop(0, `${glow}88`);
    grad.addColorStop(0.58, `${color}44`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, pr * 1.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `${color}cc`;
    for (let i = 0; i < 5; i++) {
      const a = px * 0.013 + py * 0.017 + i * 1.91;
      const d = pr * (0.78 + ((Math.sin(a * 2.3) + 1) * 0.22));
      const rr = Math.max(1.2, pr * (0.06 + ((Math.cos(a * 1.7) + 1) * 0.025)));
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Call once per frame; throttles the (relatively costly) GPU texture upload. */
  update(dt) {
    if (!this._dirty) return;
    this._timeSinceUpload += dt * 1000;
    if (this._timeSinceUpload >= PAINT.updateIntervalMs) {
      this.texture.needsUpdate = true;
      this._timeSinceUpload = 0;
      this._dirty = false;
    }
  }

  /** Force an immediate texture upload (used right before results are shown). */
  flush() {
    this.texture.needsUpdate = true;
    this._dirty = false;
    this._timeSinceUpload = 0;
  }

  getCoverage() {
    const total = this.totalCells;
    return {
      playerCells: this.playerCells,
      cpuCells: this.cpuCells,
      neutralCells: total - this.playerCells - this.cpuCells,
      totalCells: total,
      playerPct: (this.playerCells / total) * 100,
      cpuPct: (this.cpuCells / total) * 100,
    };
  }

  reset() {
    this.ownerGrid.fill(OWNER_NONE);
    this.playerCells = 0;
    this.cpuCells = 0;
    const size = PAINT.textureSize;
    this.ctx.fillStyle = '#3a4150';
    this.ctx.fillRect(0, 0, size, size);
    this.flush();
  }

  dispose() {
    this.texture.dispose();
  }
}
