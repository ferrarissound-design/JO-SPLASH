import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EnemyAI } from '../src/entities/EnemyAI.js';
import { enemyAppearancePresets } from '../src/entities/EnemyAppearance.js';
import { AI, AI_APPEARANCE_TRAITS, AI_SPECIAL_USAGE, SPECIAL } from '../src/config.js';

const APPEARANCE_INDEX = Object.fromEntries(
  enemyAppearancePresets.map((preset, index) => [preset.id, index]),
);

/** An EnemyAI locked to one archetype, with its special fully charged and ready to fire. */
function makeEnemy(appearanceId) {
  const cpu = new EnemyAI(new THREE.Vector3(0, 0, 0), {});
  cpu.applyAppearance(APPEARANCE_INDEX[appearanceId], { playIntro: false });
  cpu.special.charge = SPECIAL.maxCharge;
  cpu._specialDecisionCooldown = 0;
  return cpu;
}

/** PaintSystem stand-in — _shouldUseSpecial only reads getCoverage(). */
function makePaintSystem({ playerPct = 50, cpuPct = 50 } = {}) {
  return { getCoverage: () => ({ playerPct, cpuPct }) };
}

const alivePlayer = { alive: true };

describe('CPU special selection by appearance archetype', () => {
  it('each archetype fights with the special its traits declare', () => {
    for (const [id, traits] of Object.entries(AI_APPEARANCE_TRAITS)) {
      expect(makeEnemy(id).special.type, `${id} special`).toBe(traits.specialType);
    }
  });

  it('re-rolling the appearance mid-match swaps the special with it', () => {
    const cpu = makeEnemy('street');
    expect(cpu.special.type).toBe('burst');
    cpu.applyAppearance(APPEARANCE_INDEX.technical, { playIntro: false });
    expect(cpu.special.type).toBe('rain');
  });

  it('never swaps the special out from under an already-firing one', () => {
    const cpu = makeEnemy('street');
    cpu.special.activate(cpu, null, null);
    expect(cpu.special.active).toBe(true);

    cpu.applyAppearance(APPEARANCE_INDEX.heavy, { playIntro: false });
    expect(cpu.special.type).toBe('burst'); // still the type that is mid-flight
  });
});

describe('EnemyAI._shouldUseSpecial engagement windows', () => {
  it('burst fires at close range when pressured, but not from outside its window', () => {
    const cpu = makeEnemy('speed');
    expect(cpu.special.type).toBe('burst');
    const paint = makePaintSystem();

    expect(cpu._shouldUseSpecial(paint, alivePlayer, AI.specialCloseRange - 1)).toBe(true);
    expect(cpu._shouldUseSpecial(paint, alivePlayer, AI_SPECIAL_USAGE.burst.maxRange + 5)).toBe(false);
  });

  it('burst holds fire mid-range when nothing is actually wrong', () => {
    const cpu = makeEnemy('speed');
    const midRange = (AI.specialCloseRange + AI_SPECIAL_USAGE.burst.maxRange) / 2;
    // Even coverage, full HP, player not close: no trigger applies.
    expect(cpu._shouldUseSpecial(makePaintSystem(), alivePlayer, midRange)).toBe(false);
  });

  it('rain refuses point-blank range but fires anywhere in its band', () => {
    const cpu = makeEnemy('technical');
    expect(cpu.special.type).toBe('rain');
    const paint = makePaintSystem();
    const { minRange, maxRange } = AI_SPECIAL_USAGE.rain;

    expect(cpu._shouldUseSpecial(paint, alivePlayer, minRange - 1)).toBe(false);
    expect(cpu._shouldUseSpecial(paint, alivePlayer, maxRange + 1)).toBe(false);
    // fireOnRangeAlone: in-band is reason enough, no turf deficit needed.
    expect(cpu._shouldUseSpecial(paint, alivePlayer, SPECIAL.profiles.rain.forwardDistance)).toBe(true);
  });

  it('shield answers low HP but ignores a turf deficit it cannot fix', () => {
    const cpu = makeEnemy('heavy');
    expect(cpu.special.type).toBe('shield');
    const losingBadly = makePaintSystem({ playerPct: 70, cpuPct: 30 });
    const midRange = AI_SPECIAL_USAGE.shield.maxRange - 1;

    cpu.hp = 100;
    expect(cpu._shouldUseSpecial(losingBadly, alivePlayer, midRange)).toBe(false);

    cpu.hp = AI.specialLowHpThreshold - 1;
    expect(cpu._shouldUseSpecial(losingBadly, alivePlayer, midRange)).toBe(true);
  });

  it('gates every type on readiness, cooldown, climbing and a live target', () => {
    const cpu = makeEnemy('street');
    const paint = makePaintSystem();
    const dist = AI.specialCloseRange - 1;
    expect(cpu._shouldUseSpecial(paint, alivePlayer, dist)).toBe(true);

    cpu._specialDecisionCooldown = 2;
    expect(cpu._shouldUseSpecial(paint, alivePlayer, dist)).toBe(false);
    cpu._specialDecisionCooldown = 0;

    cpu.isClimbing = true;
    expect(cpu._shouldUseSpecial(paint, alivePlayer, dist)).toBe(false);
    cpu.isClimbing = false;

    expect(cpu._shouldUseSpecial(paint, { alive: false }, dist)).toBe(false);

    cpu.special.charge = 0;
    expect(cpu._shouldUseSpecial(paint, alivePlayer, dist)).toBe(false);
  });
});

describe('EnemyAI.specialOverridesMovement', () => {
  it('is false while nothing is active', () => {
    expect(makeEnemy('street').specialOverridesMovement).toBe(false);
  });

  it('takes over movement for burst and shield, but leaves rain to fight normally', () => {
    for (const [appearanceId, expected] of [['street', true], ['heavy', true], ['technical', false]]) {
      const cpu = makeEnemy(appearanceId);
      cpu.special.activate(cpu, null, null);
      expect(cpu.special.active).toBe(true);
      expect(cpu.specialOverridesMovement, `${appearanceId} (${cpu.special.type})`).toBe(expected);
    }
  });
});
