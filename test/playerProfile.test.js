import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerProfile, levelFromXp, xpFloorForLevel } from '../src/core/PlayerProfile.js';

describe('PlayerProfile', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    });
  });

  it('persists tutorial completion', () => {
    const profile = new PlayerProfile();
    expect(profile.tutorialComplete).toBe(false);
    expect(profile.markTutorialComplete()).toBe(true);
    expect(new PlayerProfile().tutorialComplete).toBe(true);
  });

  it('awards XP, levels and bests for real matches', () => {
    const profile = new PlayerProfile();
    const result = profile.recordMatch({
      outcome: 'win',
      difficultyId: 'elite',
      playerPct: 65,
      koPlayer: 4,
      bestCombo: 6,
      battleScore: 90,
    });
    expect(result.xpGained).toBeGreaterThan(0);
    expect(result.levelAfter).toBeGreaterThan(1);
    expect(result.rewardIds).toContain('neonCyan');
    expect(result.newBests).toContain('playerPct');
    expect(new PlayerProfile().values.xp).toBe(result.xpGained);
  });

  it('does not grant XP in practice but still records a best', () => {
    const profile = new PlayerProfile();
    const result = profile.recordMatch({ practiceMode: true, bestCombo: 3 });
    expect(result.xpGained).toBe(0);
    expect(profile.bests.bestCombo).toBe(3);
  });

  it('uses deterministic level thresholds', () => {
    expect(xpFloorForLevel(2)).toBe(100);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
  });

  it('addXp grants flat bonus XP (e.g. daily challenges) outside the match formula, and persists it', () => {
    const profile = new PlayerProfile();
    const result = profile.addXp(100);
    expect(result.xpGained).toBe(100);
    expect(result.levelBefore).toBe(1);
    expect(result.levelAfter).toBe(2);
    expect(result.leveledUp).toBe(true);
    expect(result.rewardIds).toContain('neonCyan');
    expect(new PlayerProfile().values.xp).toBe(100);
  });

  it('returns rank rewards when bonus XP alone crosses a level boundary', () => {
    const profile = new PlayerProfile();
    profile.values.xp = 90;

    const result = profile.addXp(15);

    expect(result.levelBefore).toBe(1);
    expect(result.levelAfter).toBe(2);
    expect(result.rewardIds).toEqual(['neonCyan']);
  });

  it('addXp is a no-op for zero or invalid amounts', () => {
    const profile = new PlayerProfile();
    const result = profile.addXp(0);
    expect(result.xpGained).toBe(0);
    expect(result.leveledUp).toBe(false);
    expect(result.rewardIds).toEqual([]);
    expect(profile.values.xp).toBe(0);
  });
});
