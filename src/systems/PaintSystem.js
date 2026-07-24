import * as THREE from 'three';
import { PAINT, TEAM, ARENA } from '../config.js';

const OWNER_NONE = 0;
const OWNER_PLAYER = 1;
const OWNER_CPU = 2;

const OWNER_BY_TEAM = { [TEAM.PLAYER]: OWNER_PLAYER, [TEAM.CPU]: OWNER_CPU };
const GLOSS_RGB_BY_TEAM = { [TEAM.PLAYER]: '200, 245, 255', [TEAM.CPU]: '255, 210, 179' };

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

    this._dirty = false;
    this._timeSinceUpload = 0;
    this._glosses = [];

    this._buildCanvasTexture();
  }

  _buildCanvasTexture() {
    const size = PAINT.textureSize;
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.width = size;
    this.paintCanvas.height = size;
    this.paintCtx = this.paintCanvas.getContext('2d');
    this._drawFloorBase();

    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this._compositeTexture();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  // Draws the *unpainted* floor's base look directly into paintCtx, once at
  // startup and again on reset(). This layer sits permanently beneath every
  // ink splat (splats are additional draws on top of it, never a clear), so
  // it purely establishes the "neon marine arena" floor identity — center
  // plaza concrete, navy metal at the rim, a marked platform edge and ramp
  // hazard stripes — without touching the paint grid or any gameplay read.
  // All line work stays low-alpha so it never competes with ink for
  // attention once teams start painting over it.
  _drawFloorBase() {
    const size = PAINT.textureSize;
    const ctx = this.paintCtx;
    const hw = this.halfWidth;
    const hd = this.halfDepth;
    const toPx = (x, z) => [((x + hw) / (hw * 2)) * size, ((z + hd) / (hd * 2)) * size];

    // Rim: dark navy metal deck
    ctx.fillStyle = '#101a30';
    ctx.fillRect(0, 0, size, size);

    // Center plaza: lighter, desaturated concrete (keeps ink the most
    // saturated thing in view once painted).
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.06, size / 2, size / 2, size * 0.44);
    grad.addColorStop(0, '#7c889c');
    grad.addColorStop(0.72, '#6d7a8e');
    grad.addColorStop(1, '#586475');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    ctx.fill();

    // Faint panel seams across the whole floor
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    const step = size / 11;
    for (let i = 1; i < 11; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }

    // Platform footprint: yellow/white "step edge" warning outline so the
    // raised center reads clearly even before anyone paints it.
    const hp = ARENA.platformSize / 2;
    const [px0, pz0] = toPx(-hp, -hp);
    const [px1, pz1] = toPx(hp, hp);
    ctx.strokeStyle = 'rgba(255,217,74,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(px0, pz0, px1 - px0, pz1 - pz0);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px0 - 4, pz0 - 4, (px1 - px0) + 8, (pz1 - pz0) + 8);

    // Ramp footprint: diagonal hazard-stripe wash, clipped to its rectangle.
    const rw = ARENA.rampWidth;
    const rl = ARENA.rampLength;
    const rOffX = ARENA.rampOffsetX;
    const rMinX = rOffX - rw / 2;
    const rMaxX = rOffX + rw / 2;
    const [rpx0, rpz0] = toPx(rMinX, hp);
    const [rpx1, rpz1] = toPx(rMaxX, hp + rl);
    const rx0 = Math.min(rpx0, rpx1);
    const rw_ = Math.abs(rpx1 - rpx0);
    const rh_ = rpz1 - rpz0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx0, rpz0, rw_, rh_);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,217,74,0.16)';
    const stripeW = 9;
    for (let d = -rh_; d < rw_ + rh_; d += stripeW * 2) {
      ctx.save();
      ctx.translate(rx0 + d, rpz0);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(0, 0, stripeW, rh_ * 2.4);
      ctx.restore();
    }
    ctx.restore();

    // Outer boundary marking, just inside the perimeter walls.
    const inset = size * 0.018;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 3;
    ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
    ctx.strokeStyle = 'rgba(255,217,74,0.24)';
    ctx.lineWidth = 1;
    ctx.strokeRect(inset + 5, inset + 5, size - inset * 2 - 10, size - inset * 2 - 10);

    // Scattered zone numerals, directional arrows and a center emblem —
    // low-alpha so they read as floor markings, not visual noise.
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('01', size * 0.17, size * 0.20);
    ctx.fillText('02', size * 0.83, size * 0.20);
    ctx.fillText('03', size * 0.17, size * 0.82);
    ctx.fillText('04', size * 0.83, size * 0.82);

    this._drawArrow(ctx, size * 0.5, size * 0.09, Math.PI / 2, 'rgba(255,255,255,0.1)');
    this._drawArrow(ctx, size * 0.5, size * 0.91, -Math.PI / 2, 'rgba(255,255,255,0.1)');
    this._drawArrow(ctx, size * 0.09, size * 0.5, 0, 'rgba(255,255,255,0.1)');
    this._drawArrow(ctx, size * 0.91, size * 0.5, Math.PI, 'rgba(255,255,255,0.1)');

    ctx.strokeStyle = 'rgba(180,230,255,0.14)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.07, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Small filled triangle pointing along `angle`, used as a subtle floor way-marker. */
  _drawArrow(ctx, x, y, angle, style) {
    const len = 22;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.moveTo(len * 0.6, 0);
    ctx.lineTo(-len * 0.4, -len * 0.4);
    ctx.lineTo(-len * 0.4, len * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
  paintSplat(x, z, radius, team, opts = {}) {
    const owner = OWNER_BY_TEAM[team];
    if (!owner) return 0;

    const paintedCells = this._paintGrid(x, z, radius, owner);
    this._paintCanvas(x, z, radius, team, opts);
    this._addGloss(x, z, radius, team, opts);
    this._dirty = true;
    return paintedCells;
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
    let paintedCells = 0;

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
        paintedCells++;

        if (owner === OWNER_PLAYER) this.playerCells++;
        else if (owner === OWNER_CPU) this.cpuCells++;
      }
    }
    return paintedCells;
  }

  paintTrail(x, z, radius, team, dirX = 0, dirZ = 1) {
    const owner = OWNER_BY_TEAM[team];
    if (!owner) return 0;

    const paintedCells = this._paintGrid(x, z, radius * 0.65, owner);
    const opts = { dirX, dirZ, stretch: 2.8, minorScale: 0.42, splatterScale: 0.2, glossScale: 0.45 };
    this._paintCanvas(x, z, radius, team, opts);
    this._addGloss(x, z, radius, team, opts);
    this._dirty = true;
    return paintedCells;
  }

  _paintCanvas(x, z, radius, team, opts = {}) {
    const size = PAINT.textureSize;
    const [u, v] = this._worldToUV(x, z);
    const px = u * size;
    const py = v * size;
    const pr = (radius / this.width) * size;

    const color = team === TEAM.PLAYER ? '#2fb8ff' : '#ff7a2f';
    const glow = team === TEAM.PLAYER ? '#7fe0ff' : '#ffb06f';
    const ctx = this.paintCtx;
    const angle = Math.atan2(opts.dirZ ?? 0, opts.dirX ?? 1);
    const stretch = opts.stretch ?? 1.28;
    const minorScale = opts.minorScale ?? 0.86;

    // Draw an irregular radial polygon over the same logical circle. Gameplay
    // coverage still uses the unchanged grid circle above; this only makes the
    // CanvasTexture edge feel like liquid instead of a perfect stamp.
    const lobes = 22;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.scale(stretch, minorScale);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const wobble = 0.88 + Math.sin(px * 0.071 + py * 0.043 + i * 1.73) * 0.11 + Math.sin(i * 2.41 + px * 0.019) * 0.06;
      const r = pr * wobble;
      const sx = Math.cos(a) * r;
      const sy = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Soft base bloom is painted permanently; the sharper wet sheen is
    // composited separately and fades over PAINT.glossLifeSec.
    const grad = ctx.createRadialGradient(px, py, pr * 0.18, px, py, pr * 1.18);
    grad.addColorStop(0, `${glow}a8`);
    grad.addColorStop(0.58, `${color}55`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.1 * stretch, pr * 0.92 * minorScale, angle, 0, Math.PI * 2);
    ctx.fill();

    const splatterCount = Math.floor(THREE.MathUtils.lerp(PAINT.splatterMin, PAINT.splatterMax + 1, Math.abs(Math.sin(px * 12.9898 + py * 78.233))));
    const splatterScale = opts.splatterScale ?? 1;
    ctx.fillStyle = `${color}cc`;
    for (let i = 0; i < splatterCount; i++) {
      const a = px * 0.013 + py * 0.017 + i * 1.91;
      const forwardBias = Math.cos(a * 1.37) * pr * 0.35 * stretch;
      const d = pr * splatterScale * (0.72 + ((Math.sin(a * 2.3) + 1) * 0.42));
      const rr = Math.max(0.9, pr * splatterScale * (0.045 + ((Math.cos(a * 1.7) + 1) * 0.035)));
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * d + Math.cos(angle) * forwardBias, py + Math.sin(a) * d + Math.sin(angle) * forwardBias, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _addGloss(x, z, radius, team, opts = {}) {
    const [u, v] = this._worldToUV(x, z);
    this._glosses.push({
      x: u * PAINT.textureSize,
      y: v * PAINT.textureSize,
      r: (radius / this.width) * PAINT.textureSize * (opts.glossScale ?? 1),
      dir: Math.atan2(opts.dirZ ?? 0, opts.dirX ?? 1),
      stretch: opts.stretch ?? 1.28,
      age: 0,
      rgb: GLOSS_RGB_BY_TEAM[team],
    });
    if (this._glosses.length > 96) this._glosses.splice(0, this._glosses.length - 96);
  }

  _compositeTexture() {
    this.ctx.clearRect(0, 0, PAINT.textureSize, PAINT.textureSize);
    this.ctx.drawImage(this.paintCanvas, 0, 0);

    for (const g of this._glosses) {
      const t = 1 - (g.age / PAINT.glossLifeSec);
      if (t <= 0) continue;
      this.ctx.save();
      this.ctx.translate(g.x, g.y);
      this.ctx.rotate(g.dir - 0.45);
      this.ctx.scale(g.stretch, 0.42);
      this.ctx.strokeStyle = `rgba(${g.rgb}, ${0.68 * t})`;
      this.ctx.lineWidth = Math.max(1, g.r * 0.1);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, g.r * (0.38 + 0.12 * t), -0.4, 1.05);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  /** Call once per frame; throttles the (relatively costly) GPU texture upload. */
  update(dt) {
    let glossDirty = false;
    if (this._glosses.length > 0) {
      for (const g of this._glosses) g.age += dt;
      const before = this._glosses.length;
      this._glosses = this._glosses.filter((g) => g.age < PAINT.glossLifeSec);
      glossDirty = before !== this._glosses.length || this._glosses.length > 0;
    }

    if (!this._dirty && !glossDirty) return;
    this._timeSinceUpload += dt * 1000;
    if (this._timeSinceUpload >= PAINT.updateIntervalMs) {
      this._compositeTexture();
      this.texture.needsUpdate = true;
      this._timeSinceUpload = 0;
      this._dirty = false;
    }
  }

  /** Force an immediate texture upload (used right before results are shown). */
  flush() {
    this._compositeTexture();
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
    this._drawFloorBase();
    this._glosses = [];
    this.flush();
  }

  dispose() {
    this.texture.dispose();
  }
}
