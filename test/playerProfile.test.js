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
});
