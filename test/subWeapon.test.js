import { describe, expect, it, vi } from 'vitest';
import { TEAM } from '../src/config.js';
import { InkBomb } from '../src/systems/SubWeapon.js';

const origin = { x: 0, y: 1, z: 0 };
const direction = { x: 0, y: 0, z: -1 };

function character(ink = 100) {
  return { alive: true, inkSurfActive: false, isClimbing: false, ink, team: TEAM.PLAYER };
}

describe('InkBomb selectable sub weapons', () => {
  it('deploys a mine through the gadget system', () => {
    const weapon = new InkBomb('mine');
    const owner = character();
    const deployMine = vi.fn(() => true);
    expect(weapon.fire(owner, origin, direction, { gadgetSystem: { deployMine } })).toBe(true);
    expect(deployMine).toHaveBeenCalledWith(owner);
    expect(owner.ink).toBe(74);
  });

  it('deploys a wall and rejects use without enough ink', () => {
    const weapon = new InkBomb('wall');
    const deployWall = vi.fn(() => true);
    expect(weapon.fire(character(10), origin, direction, { gadgetSystem: { deployWall } })).toBe(false);

    const owner = character();
    expect(weapon.fire(owner, origin, direction, { gadgetSystem: { deployWall } })).toBe(true);
    expect(deployWall).toHaveBeenCalledWith(owner, direction);
    expect(owner.ink).toBe(66);
  });
});
