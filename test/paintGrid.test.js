import { describe, expect, it } from 'vitest';
import { TEAM } from '../src/config.js';
import { PaintGrid } from '../src/systems/PaintGrid.js';

function makeGrid() {
  return new PaintGrid(4, 4, 8);
}

describe('PaintGrid ownership and coverage', () => {
  it('rejects unusable dimensions and resolutions', () => {
    expect(() => new PaintGrid(0, 4, 8)).toThrow(RangeError);
    expect(() => new PaintGrid(4, Number.NaN, 8)).toThrow(RangeError);
    expect(() => new PaintGrid(4, 4, 0)).toThrow(RangeError);
    expect(() => new PaintGrid(4, 4, 2.5)).toThrow(RangeError);
  });

  it('paints a circular area and reports its owner', () => {
    const grid = makeGrid();

    const painted = grid.paintSplat(0, 0, 1, TEAM.PLAYER);

    expect(painted).toBe(4);
    expect(grid.getOwnerAt(0, 0)).toBe(TEAM.PLAYER);
    expect(grid.getCoverage()).toMatchObject({
      playerCells: 4,
      cpuCells: 0,
      neutralCells: 60,
      totalCells: 64,
      playerPct: 6.25,
      cpuPct: 0,
    });
  });

  it('does not count repainting cells already owned by the same team', () => {
    const grid = makeGrid();
    grid.paintSplat(0, 0, 1, TEAM.PLAYER);

    expect(grid.paintSplat(0, 0, 1, TEAM.PLAYER)).toBe(0);
    expect(grid.playerCells).toBe(4);
  });

  it('transfers cells and counters when the opposing team paints over them', () => {
    const grid = makeGrid();
    grid.paintSplat(0, 0, 1, TEAM.PLAYER);

    expect(grid.paintSplat(0, 0, 1, TEAM.CPU)).toBe(4);
    expect(grid.getCoverage()).toMatchObject({ playerCells: 0, cpuCells: 4 });
    expect(grid.getOwnerAt(0, 0)).toBe(TEAM.CPU);
  });

  it('clips splats at arena edges without writing outside the fixed grid', () => {
    const grid = makeGrid();

    expect(grid.paintSplat(4, 4, 2, TEAM.PLAYER)).toBe(3);
    expect(grid.ownerGrid).toHaveLength(64);
    expect(grid.playerCells).toBe(3);
  });

  it('supports rectangular arenas when calculating circular coverage', () => {
    const grid = new PaintGrid(4, 2, 8);

    expect(grid.paintSplat(0, 0, 0.6, TEAM.PLAYER)).toBe(4);
  });

  it('returns no owner outside the arena instead of clamping the query', () => {
    const grid = makeGrid();
    grid.paintSplat(3.5, 3.5, 1, TEAM.PLAYER);

    expect(grid.getOwnerAt(4.01, 0)).toBeNull();
    expect(grid.getOwnerAt(0, -4.01)).toBeNull();
  });

  it('ignores invalid teams and non-positive radii', () => {
    const grid = makeGrid();

    expect(grid.paintSplat(0, 0, 1, 'spectator')).toBe(0);
    expect(grid.paintSplat(0, 0, 0, TEAM.PLAYER)).toBe(0);
    expect(grid.paintSplat(Number.NaN, 0, 1, TEAM.PLAYER)).toBe(0);
    expect(grid.paintSplat(0, Number.POSITIVE_INFINITY, 1, TEAM.PLAYER)).toBe(0);
    expect(grid.paintSplat(0, 0, Number.POSITIVE_INFINITY, TEAM.PLAYER)).toBe(0);
    expect(grid.getCoverage().neutralCells).toBe(64);
  });

  it('resets all ownership and coverage counters', () => {
    const grid = makeGrid();
    grid.paintSplat(-2, 0, 1.5, TEAM.PLAYER);
    grid.paintSplat(2, 0, 1.5, TEAM.CPU);

    grid.reset();

    expect(grid.getCoverage()).toEqual({
      playerCells: 0,
      cpuCells: 0,
      neutralCells: 64,
      totalCells: 64,
      playerPct: 0,
      cpuPct: 0,
    });
    expect([...grid.ownerGrid]).toEqual(new Array(64).fill(0));
  });
});
