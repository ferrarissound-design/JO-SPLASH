import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY, AI_APPEARANCE_TRAITS } from '../src/config.js';
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
    for (const value of Object.values(AI_APPEARANCE_TRAITS.street)) {
      expect(value).toBe(1);
    }
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
