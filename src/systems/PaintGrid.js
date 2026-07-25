import { TEAM } from '../config.js';

const OWNER_NONE = 0;
const OWNER_PLAYER = 1;
const OWNER_CPU = 2;

const OWNER_BY_TEAM = { [TEAM.PLAYER]: OWNER_PLAYER, [TEAM.CPU]: OWNER_CPU };

export function isValidPaintSplat(x, z, radius, team) {
  return Boolean(OWNER_BY_TEAM[team])
    && Number.isFinite(x)
    && Number.isFinite(z)
    && Number.isFinite(radius)
    && radius > 0;
}

// Pure gameplay representation of floor ownership. Keeping this independent
// from Canvas and Three.js lets coverage, scoring, and edge behavior be tested
// without constructing any browser rendering objects.
export class PaintGrid {
  constructor(halfWidth, halfDepth, resolution) {
    if (!Number.isFinite(halfWidth) || halfWidth <= 0 || !Number.isFinite(halfDepth) || halfDepth <= 0) {
      throw new RangeError('PaintGrid dimensions must be finite positive numbers');
    }
    if (!Number.isInteger(resolution) || resolution <= 0) {
      throw new RangeError('PaintGrid resolution must be a positive integer');
    }

    this.halfWidth = halfWidth;
    this.halfDepth = halfDepth;
    this.width = halfWidth * 2;
    this.depth = halfDepth * 2;
    this.resolution = resolution;
    this.ownerGrid = new Uint8Array(resolution * resolution);
    this.playerCells = 0;
    this.cpuCells = 0;
    this.totalCells = resolution * resolution;
  }

  worldToGrid(x, z) {
    const u = (x + this.halfWidth) / this.width;
    const v = (z + this.halfDepth) / this.depth;
    const gx = Math.max(0, Math.min(this.resolution - 1, Math.floor(u * this.resolution)));
    const gz = Math.max(0, Math.min(this.resolution - 1, Math.floor(v * this.resolution)));
    return [gx, gz];
  }

  getOwnerAt(x, z) {
    if (Math.abs(x) > this.halfWidth || Math.abs(z) > this.halfDepth) return null;
    const [gx, gz] = this.worldToGrid(x, z);
    const owner = this.ownerGrid[gz * this.resolution + gx];
    if (owner === OWNER_PLAYER) return TEAM.PLAYER;
    if (owner === OWNER_CPU) return TEAM.CPU;
    return null;
  }

  paintSplat(x, z, radius, team) {
    if (!isValidPaintSplat(x, z, radius, team)) return 0;
    const owner = OWNER_BY_TEAM[team];

    const cellWidth = this.width / this.resolution;
    const cellDepth = this.depth / this.resolution;
    const radiusX = Math.ceil(radius / cellWidth) + 1;
    const radiusZ = Math.ceil(radius / cellDepth) + 1;
    const [cx, cz] = this.worldToGrid(x, z);
    const minGx = Math.max(0, cx - radiusX);
    const maxGx = Math.min(this.resolution - 1, cx + radiusX);
    const minGz = Math.max(0, cz - radiusZ);
    const maxGz = Math.min(this.resolution - 1, cz + radiusZ);
    const radiusSq = radius * radius;
    let paintedCells = 0;

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const cellX = -this.halfWidth + (gx + 0.5) * cellWidth;
        const cellZ = -this.halfDepth + (gz + 0.5) * cellDepth;
        const dx = cellX - x;
        const dz = cellZ - z;
        if (dx * dx + dz * dz > radiusSq) continue;

        const index = gz * this.resolution + gx;
        const previousOwner = this.ownerGrid[index];
        if (previousOwner === owner) continue;

        if (previousOwner === OWNER_PLAYER) this.playerCells--;
        else if (previousOwner === OWNER_CPU) this.cpuCells--;

        this.ownerGrid[index] = owner;
        if (owner === OWNER_PLAYER) this.playerCells++;
        else this.cpuCells++;
        paintedCells++;
      }
    }

    return paintedCells;
  }

  getCoverage() {
    return {
      playerCells: this.playerCells,
      cpuCells: this.cpuCells,
      neutralCells: this.totalCells - this.playerCells - this.cpuCells,
      totalCells: this.totalCells,
      playerPct: (this.playerCells / this.totalCells) * 100,
      cpuPct: (this.cpuCells / this.totalCells) * 100,
    };
  }

  reset() {
    this.ownerGrid.fill(OWNER_NONE);
    this.playerCells = 0;
    this.cpuCells = 0;
  }
}
