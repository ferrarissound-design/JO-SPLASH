import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Progression } from '../src/core/Progression.js';

describe('Progression', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      clear: () => values.clear(),
    });
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
});
