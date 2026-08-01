import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Special } from '../src/systems/SpecialWeapon.js';
import { SPECIAL, INK, TEAM } from '../src/config.js';

function makeCharacter(overrides = {}) {
  return {
    alive: true,
    inkSurfActive: false,
    ink: 0,
    yaw: 0,
    team: TEAM.PLAYER,
    position: new THREE.Vector3(0, 0, 0),
    ...overrides,
  };
}

/** Records paintSplat/spawnSplat/onCharacterHit calls without touching real rendering. */
function makeCtx(opponent = null) {
  const paintCalls = [];
  const hitCalls = [];
  return {
    paintCalls,
    hitCalls,
    paintSystem: { paintSplat: (x, z, radius, team, opts) => paintCalls.push({ x, z, radius, team, opts }) },
    particleManager: { spawnSplat: () => {} },
    opponent,
    onCharacterHit: (team, damage, pos) => hitCalls.push({ team, damage, pos }),
  };
}

describe('Special charge economy and type selection', () => {
  it('accumulates charge from painted cells and caps at maxCharge', () => {
    const special = new Special(TEAM.PLAYER);
    special.addCharge(SPECIAL.cellsPerCharge * (SPECIAL.maxCharge / 2));
    expect(special.charge).toBeCloseTo(SPECIAL.maxCharge / 2);
    expect(special.ready).toBe(false);

    special.addCharge(SPECIAL.cellsPerCharge * SPECIAL.maxCharge);
    expect(special.charge).toBe(SPECIAL.maxCharge);
    expect(special.ready).toBe(true);
  });

  it('defaults to burst and exposes its profile/displayName', () => {
    const special = new Special(TEAM.PLAYER);
    expect(special.type).toBe('burst');
    expect(special.profile).toBe(SPECIAL.profiles.burst);
    expect(special.displayName).toBe('INK BURST');
  });

  it('setType switches profile but refuses unknown types or switching while active', () => {
    const special = new Special(TEAM.PLAYER);
    expect(special.setType('rain')).toBe(true);
    expect(special.type).toBe('rain');
    expect(special.setType('not-a-type')).toBe(false);
    expect(special.type).toBe('rain');

    special.charge = SPECIAL.maxCharge;
    special.activate(makeCharacter(), null, null);
    expect(special.setType('shield')).toBe(false);
    expect(special.type).toBe('rain');
  });
});

describe('Special.activate gating', () => {
  it('refuses to activate unless fully charged, alive, and not ink-surfing', () => {
    const special = new Special(TEAM.PLAYER);
    expect(special.activate(makeCharacter(), null, null)).toBe(false);

    special.charge = SPECIAL.maxCharge;
    expect(special.activate(makeCharacter({ alive: false }), null, null)).toBe(false);
    expect(special.activate(makeCharacter({ inkSurfActive: true }), null, null)).toBe(false);
  });

  it('on success, refills ink, resets charge, and marks active', () => {
    const special = new Special(TEAM.PLAYER);
    special.charge = SPECIAL.maxCharge;
    const character = makeCharacter({ ink: 0 });

    expect(special.activate(character, null, null)).toBe(true);
    expect(special.active).toBe(true);
    expect(special.charge).toBe(0);
    expect(character.ink).toBe(INK.max);
    expect(special.activate(character, null, null)).toBe(false); // already active
  });
});

describe('INK BURST — self-centered expanding pulses', () => {
  it('hits the opponent at most once, as soon as a pulse radius reaches them', () => {
    const special = new Special(TEAM.PLAYER, 'burst');
    special.charge = SPECIAL.maxCharge;
    const character = makeCharacter();
    const opponent = makeCharacter({ team: TEAM.CPU, position: new THREE.Vector3(0, 0, 3) });
    special.activate(character, null, null);

    const ctx = makeCtx(opponent);
    special.update(0.2, character, ctx);
    expect(ctx.hitCalls).toHaveLength(1);
    expect(ctx.hitCalls[0]).toMatchObject({ team: TEAM.CPU, damage: SPECIAL.profiles.burst.damage });

    special.update(0.3, character, ctx);
    expect(ctx.hitCalls).toHaveLength(1); // no double-hit across further pulses
  });

  it('deactivates once its duration has fully elapsed', () => {
    const special = new Special(TEAM.PLAYER, 'burst');
    special.charge = SPECIAL.maxCharge;
    const character = makeCharacter();
    special.activate(character, null, null);

    const ctx = makeCtx(null);
    special.update(SPECIAL.profiles.burst.durationSec + 1, character, ctx);
    expect(special.active).toBe(false);
  });
});

describe('INK RAIN — locked-in ranged pulses', () => {
  it('locks the target point ahead of the character at activation and keeps painting it even if the character moves', () => {
    const special = new Special(TEAM.PLAYER, 'rain');
    special.charge = SPECIAL.maxCharge;
    const character = makeCharacter({ yaw: 0 }); // forward = (0, 0, -1)
    special.activate(character, null, null);

    const forwardDistance = SPECIAL.profiles.rain.forwardDistance;
    character.position.set(5, 0, 5); // character wanders off after locking the target

    const ctx = makeCtx(null);
    special.update(0.31, character, ctx); // one pulse interval
    expect(ctx.paintCalls[0].x).toBeCloseTo(0);
    expect(ctx.paintCalls[0].z).toBeCloseTo(-forwardDistance);
  });

  it('can hit the opponent on every pulse, unlike burst\'s single hit', () => {
    const special = new Special(TEAM.PLAYER, 'rain');
    special.charge = SPECIAL.maxCharge;
    const character = makeCharacter({ yaw: 0 });
    special.activate(character, null, null);

    const forwardDistance = SPECIAL.profiles.rain.forwardDistance;
    const opponent = makeCharacter({ team: TEAM.CPU, position: new THREE.Vector3(0, 0, -forwardDistance) });
    const ctx = makeCtx(opponent);

    special.update(0.35, character, ctx); // spans two pulse intervals (0.3 each)
    expect(ctx.hitCalls).toHaveLength(2);
    expect(ctx.hitCalls[0].damage).toBe(SPECIAL.profiles.rain.damagePerPulse);
  });
});

describe('COLOR SHIELD — defensive, no opponent damage', () => {
  let special;
  beforeEach(() => { special = new Special(TEAM.PLAYER, 'shield'); });

  it('reduces damageMultiplier only while active', () => {
    expect(special.damageMultiplier).toBe(1);
    special.charge = SPECIAL.maxCharge;
    special.activate(makeCharacter(), null, null);
    expect(special.damageMultiplier).toBeCloseTo(1 - SPECIAL.profiles.shield.damageReduction);
  });

  it('paints under the character on a tick interval and never damages the opponent', () => {
    special.charge = SPECIAL.maxCharge;
    const character = makeCharacter({ position: new THREE.Vector3(2, 0, -4) });
    special.activate(character, null, null);

    const opponent = makeCharacter({ team: TEAM.CPU, position: character.position.clone() });
    const ctx = makeCtx(opponent);
    special.update(SPECIAL.profiles.shield.tickIntervalSec, character, ctx);

    expect(ctx.paintCalls).toHaveLength(1);
    expect(ctx.paintCalls[0]).toMatchObject({ x: 2, z: -4, radius: SPECIAL.profiles.shield.tickRadius });
    expect(ctx.hitCalls).toHaveLength(0);
  });

  it('damageMultiplier returns to 1 once the duration expires', () => {
    special.charge = SPECIAL.maxCharge;
    const character = makeCharacter();
    special.activate(character, null, null);

    special.update(SPECIAL.profiles.shield.durationSec + 1, character, makeCtx(null));
    expect(special.active).toBe(false);
    expect(special.damageMultiplier).toBe(1);
  });
});

describe('Special.reset', () => {
  it('force-clears active state and charge regardless of progress', () => {
    const special = new Special(TEAM.PLAYER, 'burst');
    special.charge = SPECIAL.maxCharge;
    special.activate(makeCharacter(), null, null);
    special.update(0.1, makeCharacter(), makeCtx(null));

    special.reset();
    expect(special.active).toBe(false);
    expect(special.charge).toBe(0);
    expect(special.timer).toBe(0);
  });
});
