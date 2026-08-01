import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHALLENGES, Progression, REWARDS } from '../src/core/Progression.js';

describe('Progression', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      clear: () => values.clear(),
    });
  });

  it('provides Japanese challenge and reward labels', () => {
    expect(CHALLENGES.every((challenge) => challenge.labelJa && challenge.rewardJa)).toBe(true);
    expect(REWARDS.neonCyan.labelJa).toBe('ネオンシアン');
  });

  it('unlocks earned challenges once and persists them', () => {
    const progression = new Progression();
    const earned = progression.evaluate({ playerPct: 63, skySplashes: 3, bestCombo: 5 });
    expect(earned.map((challenge) => challenge.id)).toEqual(['painter', 'aerial', 'combo']);
    expect(progression.evaluate({ playerPct: 70 }).length).toBe(0);
    expect(new Progression().unlocked).toEqual(new Set(['painter', 'aerial', 'combo']));
  });

  it('keeps the cup reward locked until a cup is won', () => {
    const progression = new Progression();
    expect(progression.evaluate({ cupChampion: false })).toEqual([]);
    expect(progression.evaluate({ cupChampion: true })[0].id).toBe('champion');
  });

  it('only equips unlocked rewards and persists the selected loadout', () => {
    const progression = new Progression();
    expect(progression.equip('goldChampion')).toBe(false);
    progression.evaluate({ bestCombo: 5 });
    expect(progression.equip('comboGlow')).toBe(true);
    expect(progression.equipped.effect).toBe('comboGlow');
    expect(new Progression().equipped.effect).toBe('comboGlow');
  });

  it('unlocks rank rewards independently from challenges', () => {
    const progression = new Progression();
    expect(progression.unlockRewards(['neonCyan']).map((reward) => reward.id)).toEqual(['neonCyan']);
    expect(progression.availableRewards.has('neonCyan')).toBe(true);
    expect(progression.equip('neonCyan')).toBe(true);
    expect(new Progression().equipped.theme).toBe('neonCyan');
  });

  it('unlocks gear power rewards from their dedicated match conditions', () => {
    const progression = new Progression();

    expect(progression.evaluate({ outcome: 'win', deaths: 1 })).toEqual([]); // died once — not flawless, not a comeback
    expect(progression.evaluate({ outcome: 'win', deaths: 0 })[0].id).toBe('survivor');
    expect(progression.evaluate({ outcome: 'lose', deaths: 3 })).toEqual([]); // comeback requires a win
    expect(progression.evaluate({ outcome: 'win', deaths: 3 })[0].id).toBe('comeback');
    expect(progression.evaluate({ climbs: 4 })).toEqual([]);
    expect(progression.evaluate({ climbs: 5 })[0].id).toBe('climber');

    expect(progression.availableRewards.has('aquaRevival')).toBe(true);
    expect(progression.availableRewards.has('quickRespawn')).toBe(true);
    expect(progression.availableRewards.has('surfBoost')).toBe(true);
    expect(progression.equip('aquaRevival')).toBe(true);
    expect(new Progression().equipped.gear).toBe('aquaRevival');
  });
});
