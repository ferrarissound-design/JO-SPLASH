import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Weapon } from '../src/systems/Weapon.js';
import { WEAPON } from '../src/config.js';

/** Minimal stand-in for a Character — Weapon only reads these fields. */
function makeCharacter(overrides = {}) {
  return {
    alive: true,
    inkSurfActive: false,
    isClimbing: false,
    ink: 100,
    team: 'player',
    ...overrides,
  };
}

/** Captures whatever profile Weapon._fireProfile hands to the projectile manager. */
function makeSpawnRecorder() {
  const spawned = [];
  return {
    spawned,
    spawn(origin, direction, team, profile) {
      spawned.push({ origin: origin.clone(), direction: direction.clone(), team, profile });
      return true;
    },
  };
}

const ORIGIN = new THREE.Vector3(0, 1, 0);
const DIR = new THREE.Vector3(0, 0, -1);

describe('Weapon.canFire gating', () => {
  it('refuses to fire when dead, submerged, climbing, on cooldown, or out of ink', () => {
    const weapon = new Weapon('stream');
    expect(weapon.canFire(makeCharacter())).toBe(true);
    expect(weapon.canFire(makeCharacter({ alive: false }))).toBe(false);
    expect(weapon.canFire(makeCharacter({ inkSurfActive: true }))).toBe(false);
    expect(weapon.canFire(makeCharacter({ isClimbing: true }))).toBe(false);
    expect(weapon.canFire(makeCharacter({ ink: 0 }))).toBe(false);

    weapon.cooldown = 0.2;
    expect(weapon.canFire(makeCharacter())).toBe(false);
  });
});

describe('Weapon.fire (non-charge profile)', () => {
  it('spawns one projectile, deducts ink, and sets cooldown', () => {
    const weapon = new Weapon('stream');
    const character = makeCharacter();
    const recorder = makeSpawnRecorder();

    const fired = weapon.fire(character, ORIGIN, DIR, recorder, null, null);

    expect(fired).toBe(true);
    expect(recorder.spawned).toHaveLength(1);
    expect(character.ink).toBe(100 - WEAPON.profiles.stream.costPerShot);
    expect(weapon.cooldown).toBeCloseTo(WEAPON.profiles.stream.fireInterval);
  });

  it('SPREAD fires its full pellet count in a single shot', () => {
    const weapon = new Weapon('spread');
    const character = makeCharacter();
    const recorder = makeSpawnRecorder();

    weapon.fire(character, ORIGIN, DIR, recorder, null, null);

    expect(recorder.spawned).toHaveLength(WEAPON.profiles.spread.pelletCount);
  });
});

describe('Weapon PRECISION charge-to-release scaling', () => {
  let weapon;
  let character;

  beforeEach(() => {
    weapon = new Weapon('precision');
    character = makeCharacter();
  });

  it('a full charge release uses the profile\'s full-charge endpoint stats', () => {
    const charge = WEAPON.profiles.precision.charge;
    expect(weapon.beginCharge(character, null)).toBe(true);
    weapon.updateCharge(charge.durationSec, character, null);
    expect(weapon.chargeReady).toBe(true);

    const recorder = makeSpawnRecorder();
    const fired = weapon.releaseCharge(character, ORIGIN, DIR, recorder, null, null);

    expect(fired).toBe(true);
    const { profile } = recorder.spawned[0];
    expect(profile.damage).toBeCloseTo(charge.fullDamage);
    expect(profile.projectileSpeed).toBeCloseTo(charge.fullProjectileSpeed);
    expect(profile.chargeRatio).toBeCloseTo(1);
  });

  it('releasing immediately (near-zero charge) uses the minimum-charge endpoint stats', () => {
    const charge = WEAPON.profiles.precision.charge;
    expect(weapon.beginCharge(character, null)).toBe(true);
    // No updateCharge tick at all — charge stays at 0, i.e. the eased ratio is exactly 0.

    const recorder = makeSpawnRecorder();
    weapon.releaseCharge(character, ORIGIN, DIR, recorder, null, null);

    const { profile } = recorder.spawned[0];
    expect(profile.damage).toBeCloseTo(charge.minDamage);
    expect(profile.projectileSpeed).toBeCloseTo(charge.minProjectileSpeed);
    expect(profile.chargeRatio).toBeCloseTo(0);
  });

  it('resets after releasing so the next charge starts clean', () => {
    const charge = WEAPON.profiles.precision.charge;
    weapon.beginCharge(character, null);
    weapon.updateCharge(charge.durationSec, character, null);
    weapon.releaseCharge(character, ORIGIN, DIR, makeSpawnRecorder(), null, null);

    expect(weapon.charging).toBe(false);
    expect(weapon.charge).toBe(0);
    expect(weapon.chargeReady).toBe(false);
  });

  it('storing a full charge then restoring it reproduces a full-power shot', () => {
    const charge = WEAPON.profiles.precision.charge;
    weapon.beginCharge(character, null);
    weapon.updateCharge(charge.durationSec, character, null);
    expect(weapon.storeFullCharge(null)).toBe(true);
    expect(weapon.chargeStored).toBe(true);

    expect(weapon.restoreStoredCharge(null)).toBe(true);
    expect(weapon.chargeStored).toBe(false);
    expect(weapon.chargeReady).toBe(true);

    const recorder = makeSpawnRecorder();
    weapon.releaseCharge(character, ORIGIN, DIR, recorder, null, null);
    expect(recorder.spawned[0].profile.damage).toBeCloseTo(charge.fullDamage);
  });

  it('a stored charge expires after storeDurationSec without being restored', () => {
    const charge = WEAPON.profiles.precision.charge;
    weapon.beginCharge(character, null);
    weapon.updateCharge(charge.durationSec, character, null);
    weapon.storeFullCharge(null);

    const stillStored = weapon.updateStoredCharge(charge.storeDurationSec + 0.01, null);

    expect(stillStored).toBe(false);
    expect(weapon.chargeStored).toBe(false);
  });
});

describe('Weapon.setType', () => {
  it('clamps the carried-over cooldown to the new profile\'s fire interval', () => {
    const weapon = new Weapon('precision'); // longer fireInterval than stream
    weapon.cooldown = WEAPON.profiles.precision.fireInterval;

    expect(weapon.setType('stream')).toBe(true);
    expect(weapon.cooldown).toBeLessThanOrEqual(WEAPON.profiles.stream.fireInterval);
  });

  it('is a no-op when switching to the already-equipped type', () => {
    const weapon = new Weapon('stream');
    expect(weapon.setType('stream')).toBe(false);
  });
});
