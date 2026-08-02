import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY, AI_APPEARANCE_TRAITS, AI_SPECIAL_USAGE, SPECIAL } from '../src/config.js';
import { enemyAppearancePresets } from '../src/entities/EnemyAppearance.js';

describe('AI_APPEARANCE_TRAITS', () => {
  it('has an entry for every enemy appearance preset', () => {
    for (const preset of enemyAppearancePresets) {
      expect(AI_APPEARANCE_TRAITS, `missing traits for appearance "${preset.id}"`).toHaveProperty(preset.id);
    }
  });

  it('every trait set defines the full multiplier shape EnemyAI expects', () => {
    const expectedKeys = [
      'moveSpeedMult',
      'aimJitterMult',
      'bombPressureMult',
      'spreadRangeMult',
      'precisionRangeMult',
      'fleeHpThresholdMult',
    ];
    for (const [id, traits] of Object.entries(AI_APPEARANCE_TRAITS)) {
      for (const key of expectedKeys) {
        expect(traits, `${id}.${key}`).toHaveProperty(key);
        expect(typeof traits[key], `${id}.${key} should be numeric`).toBe('number');
      }
    }
  });

  it('"street" is the neutral baseline (every multiplier is 1)', () => {
    for (const [key, value] of Object.entries(AI_APPEARANCE_TRAITS.street)) {
      if (typeof value !== 'number') continue; // non-numeric traits (e.g. specialType) have no baseline
      expect(value, `street.${key}`).toBe(1);
    }
  });

  it('every trait set picks a real special profile for the CPU to fight with', () => {
    for (const [id, traits] of Object.entries(AI_APPEARANCE_TRAITS)) {
      expect(SPECIAL.profiles, `${id}.specialType`).toHaveProperty(traits.specialType);
    }
  });
});

describe('AI_SPECIAL_USAGE', () => {
  it('covers every selectable special so the CPU never falls back silently', () => {
    for (const type of Object.keys(SPECIAL.profiles)) {
      expect(AI_SPECIAL_USAGE, `missing CPU usage rules for "${type}"`).toHaveProperty(type);
    }
  });

  it('defines a usable engagement window and a known pursuit mode for each type', () => {
    for (const [type, usage] of Object.entries(AI_SPECIAL_USAGE)) {
      expect(usage.minRange, `${type}.minRange`).toBeLessThan(usage.maxRange);
      expect(['orbit', 'push', 'free'], `${type}.pursuit`).toContain(usage.pursuit);
      expect(typeof usage.pursuitSpeedMult, `${type}.pursuitSpeedMult`).toBe('number');
    }
  });

  it('keeps rain out of point-blank range, where its locked target would land past the player', () => {
    expect(AI_SPECIAL_USAGE.rain.minRange).toBeGreaterThan(0);
    expect(AI_SPECIAL_USAGE.rain.minRange).toBeLessThan(SPECIAL.profiles.rain.forwardDistance);
    expect(AI_SPECIAL_USAGE.rain.maxRange).toBeGreaterThan(SPECIAL.profiles.rain.forwardDistance);
  });
});

describe('AI_DIFFICULTY presets', () => {
  it('rookie is slower/sloppier and elite is faster/sharper than standard', () => {
    expect(AI_DIFFICULTY.rookie.aimJitterMult).toBeGreaterThan(AI_DIFFICULTY.standard.aimJitterMult);
    expect(AI_DIFFICULTY.elite.aimJitterMult).toBeLessThan(AI_DIFFICULTY.standard.aimJitterMult);
    expect(AI_DIFFICULTY.rookie.reactionDelay).toBeGreaterThan(AI_DIFFICULTY.standard.reactionDelay);
    expect(AI_DIFFICULTY.elite.reactionDelay).toBeLessThan(AI_DIFFICULTY.standard.reactionDelay);
  });

  it('every preset carries a matching id/label pair', () => {
    for (const [key, preset] of Object.entries(AI_DIFFICULTY)) {
      expect(preset.id).toBe(key);
      expect(typeof preset.label).toBe('string');
    }
  });
});
