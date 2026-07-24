import * as THREE from 'three';
import { PAINT, TEAM, COLORS } from '../config.js';

const OWNER_NONE = 0;
const OWNER_PLAYER = 1;
const OWNER_CPU = 2;
const OWNER_BY_TEAM = { [TEAM.PLAYER]: OWNER_PLAYER, [TEAM.CPU]: OWNER_CPU };
const COLOR_BY_TEAM = { [TEAM.PLAYER]: '#2fb8ff', [TEAM.CPU]: '#ff7a2f' };

const _rel = new THREE.Vector3();

function hexToCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

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

    this.cols = PAINT.wallGridCols;
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
    if (!owner) return;

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
        if (owner === OWNER_PLAYER) this.playerCells++;
        else this.cpuCells++;
      }
    }

    const px = u * this.textureSize;
    const py = v * this.textureSize;
    const pr = Math.max(ru, rv) * this.textureSize * 0.8;
    const color = COLOR_BY_TEAM[team];
    const grad = this.ctx.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, `${color}f0`);
    grad.addColorStop(0.7, `${color}90`);
    grad.addColorStop(1, `${color}00`);
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(px, py, pr, 0, Math.PI * 2);
    this.ctx.fill();
    this.texture.needsUpdate = true;
  }

  reset() {
    this.grid.fill(OWNER_NONE);
    this.playerCells = 0;
    this.cpuCells = 0;
    this.ctx.clearRect(0, 0, this.textureSize, this.textureSize);
    this.ctx.fillStyle = hexToCss(COLORS.climbPanelBase);
    this.ctx.fillRect(0, 0, this.textureSize, this.textureSize);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
