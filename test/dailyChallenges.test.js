import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DAILY_CHALLENGE_POOL, DailyChallenges, pickDailyChallenges, todayKey,
} from '../src/core/DailyChallenges.js';

describe('pickDailyChallenges', () => {
  it('deterministically picks 3 unique challenges for a given date key', () => {
    const picksA = pickDailyChallenges('2026-08-01');
    const picksB = pickDailyChallenges('2026-08-01');
    expect(picksA.map((c) => c.id)).toEqual(picksB.map((c) => c.id));
    expect(picksA).toHaveLength(3);
    expect(new Set(picksA.map((c) => c.id)).size).toBe(3);
    for (const challenge of picksA) {
      expect(DAILY_CHALLENGE_POOL.some((candidate) => candidate.id === challenge.id)).toBe(true);
    }
  });

  it('can pick a different set for a different date', () => {
    const picksA = pickDailyChallenges('2026-08-01').map((c) => c.id);
    const picksB = pickDailyChallenges('2099-01-01').map((c) => c.id);
    expect(picksA).not.toEqual(picksB);
  });
});

describe('DailyChallenges', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    });
  });

  it('marks a challenge completed once its check passes, and never twice', () => {
    const daily = new DailyChallenges();
    const [first] = daily.todaysChallenges;

    // Build stats that satisfy every pool entry so whichever 3 were picked, all pass.
    const stats = {
      outcome: 'win', playerPct: 100, bestCombo: 99, koPlayer: 99,
      subWeaponsUsed: 99, specialsUsed: 99, climbs: 99, deaths: 0,
    };

    const result = daily.evaluate(stats);
    expect(result.earned.map((c) => c.id)).toContain(first.id);
    expect(daily.completed.has(first.id)).toBe(true);

    const second = daily.evaluate(stats);
    expect(second.earned).toHaveLength(0);
    expect(second.totalXp).toBe(0);
  });

  it('only awards challenges whose check actually passes', () => {
    const daily = new DailyChallenges();
    const result = daily.evaluate({
      outcome: 'lose', playerPct: 0, bestCombo: 0, koPlayer: 0,
      subWeaponsUsed: 0, specialsUsed: 0, climbs: 0, deaths: 5,
    });
    expect(result.earned).toHaveLength(0);
    expect(daily.completed.size).toBe(0);
  });

  it('persists completion state across instances for the same day', () => {
    const daily = new DailyChallenges();
    daily.evaluate({
      outcome: 'win', playerPct: 100, bestCombo: 99, koPlayer: 99,
      subWeaponsUsed: 99, specialsUsed: 99, climbs: 99, deaths: 0,
    });
    const completedBefore = daily.completed;
    expect(completedBefore.size).toBeGreaterThan(0);
    expect(new DailyChallenges().completed).toEqual(completedBefore);
  });

  it('resets completion state when the stored date is not today', () => {
    localStorage.setItem('chromaDuel.dailyChallenges.v1', JSON.stringify({
      date: '2000-01-01',
      completedIds: DAILY_CHALLENGE_POOL.map((c) => c.id),
    }));
    const daily = new DailyChallenges();
    expect(daily.completed.size).toBe(0);
  });

  it('todayKey formats the current date as YYYY-MM-DD', () => {
    expect(todayKey(new Date('2026-08-01T12:34:56Z'))).toBe('2026-08-01');
  });
});
