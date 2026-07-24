import * as THREE from 'three';
import { PAINT, TEAM } from '../config.js';

const OWNER_NONE = 0;
const OWNER_PLAYER = 1;
const OWNER_CPU = 2;
const OWNER_BY_TEAM = { [TEAM.PLAYER]: OWNER_PLAYER, [TEAM.CPU]: OWNER_CPU };
const COLOR_BY_TEAM = { [TEAM.PLAYER]: '#2fb8ff', [TEAM.CPU]: '#ff7a2f' };

const _rel = new THREE.Vector3();
const _strokeSample = new THREE.Vector3();

// ============================================================================
// WallPanel — a small paintable vertical surface. Unlike PaintSystem's floor
// grid (one shared world-space canvas), each panel owns a tiny independent
// grid/canvas mapped by (origin, tangent, height): u runs along the panel's
// width, v runs up from the ground. Coverage here never feeds match score —
// it only gates whether a team may climb the panel (see Player's wall-climb
// logic), so a coarse grid and a plain radial-gradient splat are plenty.
// ============================================================================
export class WallPanel {
  constructor(origin, tangent, width, height) {
    this.origin = origin.clone(); // world position of the (u=0, v=0) corner
    this.tangent = tangent.clone().normalize(); // unit vector along the width axis
    this.width = width;
    this.height = height;

    this.cols = THREE.MathUtils.clamp(
      Math.ceil(PAINT.wallGridRows * width / Math.max(0.1, height)),
      4,
      96,
    );
    this.rows = PAINT.wallGridRows;
    this.grid = new Uint8Array(this.cols * this.rows);
    this.playerCells = 0;
    this.cpuCells = 0;
    this.totalCells = this.cols * this.rows;

    this.textureSize = PAINT.wallTextureSize;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.textureSize;
    this.canvas.height = this.textureSize;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.reset();
  }

  _worldToUV(point) {
    _rel.subVectors(point, this.origin);
    const u = _rel.dot(this.tangent) / this.width;
    const v = _rel.y / this.height;
    return [THREE.MathUtils.clamp(u, 0, 1), THREE.MathUtils.clamp(v, 0, 1)];
  }

  coverageFraction(team) {
    if (this.totalCells === 0) return 0;
    return (team === TEAM.PLAYER ? this.playerCells : this.cpuCells) / this.totalCells;
  }

  /**
   * Whether the team's ink forms a continuous bottom-to-top route near the
   * supplied world position. Each next row may bend sideways by the configured
   * tolerance, so a real painted stripe works while scattered blobs do not.
   */
  hasVerticalPath(team, point) {
    const owner = OWNER_BY_TEAM[team];
    if (!owner) return false;

    const [u] = this._worldToUV(point);
    const centerCol = THREE.MathUtils.clamp(Math.floor(u * this.cols), 0, this.cols - 1);
    const tolerance = PAINT.wallPathToleranceCols;

    let reachable = new Set();
    for (let c = Math.max(0, centerCol - tolerance); c <= Math.min(this.cols - 1, centerCol + tolerance); c++) {
      if (this.grid[c] === owner) reachable.add(c);
    }
    if (reachable.size === 0) return false;

    for (let r = 1; r < this.rows; r++) {
      const next = new Set();
      for (const prevCol of reachable) {
        for (let c = Math.max(0, prevCol - tolerance); c <= Math.min(this.cols - 1, prevCol + tolerance); c++) {
          if (this.grid[r * this.cols + c] === owner) next.add(c);
        }
      }
      if (next.size === 0) return false;
      reachable = next;
    }
    return true;
  }

  /** Paint a circular splat (world-space radius) centered at a world point, owned by `team`. */
  paintSplat(point, radiusWorld, team) {
    const owner = OWNER_BY_TEAM[team];
    if (!owner) return 0;

    const [u, v] = this._worldToUV(point);
    const ru = radiusWorld / this.width;
    const rv = radiusWorld / this.height;

    const cu = Math.round(u * this.cols);
    const cv = Math.round(v * this.rows);
    const cellRu = Math.ceil(ru * this.cols) + 1;
    const cellRv = Math.ceil(rv * this.rows) + 1;

    const minC = Math.max(0, cu - cellRu);
    const maxC = Math.min(this.cols - 1, cu + cellRu);
    const minR = Math.max(0, cv - cellRv);
    const maxR = Math.min(this.rows - 1, cv + cellRv);

    let paintedCells = 0;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const du = (c + 0.5) / this.cols - u;
        const dv = (r + 0.5) / this.rows - v;
        if ((du * du) / (ru * ru + 1e-6) + (dv * dv) / (rv * rv + 1e-6) > 1) continue;

        const idx = r * this.cols + c;
        const prev = this.grid[idx];
        if (prev === owner) continue;
        if (prev === OWNER_PLAYER) this.playerCells--;
        else if (prev === OWNER_CPU) this.cpuCells--;
        this.grid[idx] = owner;
        paintedCells++;
        if (owner === OWNER_PLAYER) this.playerCells++;
        else this.cpuCells++;
      }
    }

    const px = u * this.textureSize;
    const py = v * this.textureSize;
    const prx = Math.max(1, ru * this.textureSize * 0.8);
    const pry = Math.max(1, rv * this.textureSize * 0.8);
    const color = COLOR_BY_TEAM[team];
    this.ctx.save();
    this.ctx.translate(px, py);
    this.ctx.scale(prx, pry);
    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `${color}f0`);
    grad.addColorStop(0.7, `${color}90`);
    grad.addColorStop(1, `${color}00`);
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 1, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
    this.texture.needsUpdate = true;
    return paintedCells;
  }

  /**
   * Paints a charger-style stripe ending at `point`. The incoming shot
   * direction is projected onto the wall plane; a near-perpendicular hit
   * falls back to a vertical bottom-to-top stroke so a charged shot remains
   * useful for opening a climb route.
   */
  paintStroke(point, direction, lengthWorld, radiusWorld, team) {
    if (lengthWorld <= 0 || radiusWorld <= 0) return 0;

    const along = direction.dot(this.tangent);
    let vertical = direction.y;
    let projectedLength = Math.hypot(along, vertical);
    let alongNorm = along;
    if (projectedLength < 0.45) {
      // A shot arriving almost straight into the wall has no meaningful
      // in-plane direction. Stamp upward from the wall base at the impact
      // column so a full charge creates one continuous climb route.
      _rel.subVectors(point, this.origin);
      const impactU = THREE.MathUtils.clamp(_rel.dot(this.tangent), 0, this.width);
      const paintedHeight = Math.min(this.height, lengthWorld);
      const spacing = Math.max(0.2, radiusWorld * 0.72);
      const steps = Math.max(1, Math.ceil(paintedHeight / spacing));
      let paintedCells = 0;
      for (let i = 0; i <= steps; i++) {
        _strokeSample.copy(this.origin)
          .addScaledVector(this.tangent, impactU);
        _strokeSample.y = this.origin.y + paintedHeight * (i / steps);
        paintedCells += this.paintSplat(_strokeSample, radiusWorld, team);
      }
      return paintedCells;
    }
    alongNorm /= projectedLength;
    vertical /= projectedLength;

    const spacing = Math.max(0.2, radiusWorld * 0.72);
    const steps = Math.max(1, Math.ceil(lengthWorld / spacing));
    let paintedCells = 0;
    for (let i = 0; i <= steps; i++) {
      const distanceBack = lengthWorld * (1 - i / steps);
      _strokeSample.copy(point).addScaledVector(this.tangent, -alongNorm * distanceBack);
      _strokeSample.y -= vertical * distanceBack;

      _rel.subVectors(_strokeSample, this.origin);
      const rawU = _rel.dot(this.tangent) / this.width;
      const rawV = _rel.y / this.height;
      if (rawU < 0 || rawU > 1 || rawV < 0 || rawV > 1) continue;
      paintedCells += this.paintSplat(_strokeSample, radiusWorld, team);
    }
    return paintedCells;
  }

  reset() {
    this.grid.fill(OWNER_NONE);
    this.playerCells = 0;
    this.cpuCells = 0;
    this.ctx.clearRect(0, 0, this.textureSize, this.textureSize);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
