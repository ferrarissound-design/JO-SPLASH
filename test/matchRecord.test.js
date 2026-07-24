import { describe, it, expect, beforeEach } from 'vitest';

/** Minimal in-memory localStorage stand-in — MatchRecord only uses getItem/setItem. */
function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  globalThis.localStorage = makeMemoryStorage();
});

describe('MatchRecord', () => {
  it('starts empty with zero matches and zero average coverage', async () => {
    const { MatchRecord } = await import('../src/core/MatchRecord.js?fresh1');
    const record = new MatchRecord();
    expect(record.totalMatches).toBe(0);
    expect(record.averagePlayerPct).toBe(0);
  });

  it('tallies wins/losses/draws overall and per difficulty', async () => {
    const { MatchRecord } = await import('../src/core/MatchRecord.js?fresh2');
    const record = new MatchRecord();

    record.recordMatch({ outcome: 'win', difficultyId: 'standard', playerPct: 60, koPlayer: 2, koCpu: 1 });
    record.recordMatch({ outcome: 'lose', difficultyId: 'elite', playerPct: 40, koPlayer: 0, koCpu: 3 });
    record.recordMatch({ outcome: 'draw', difficultyId: 'standard', playerPct: 50, koPlayer: 1, koCpu: 1 });

    expect(record.values.wins).toBe(1);
    expect(record.values.losses).toBe(1);
    expect(record.values.draws).toBe(1);
    expect(record.totalMatches).toBe(3);
    expect(record.values.koFor).toBe(3);
    expect(record.values.koAgainst).toBe(5);

    expect(record.values.byDifficulty.standard).toEqual({ wins: 1, losses: 0, draws: 1 });
    expect(record.values.byDifficulty.elite).toEqual({ wins: 0, losses: 1, draws: 0 });
    expect(record.values.byDifficulty.rookie).toEqual({ wins: 0, losses: 0, draws: 0 });
  });

  it('computes the average player coverage percentage across recorded matches', async () => {
    const { MatchRecord } = await import('../src/core/MatchRecord.js?fresh3');
    const record = new MatchRecord();
    record.recordMatch({ outcome: 'win', difficultyId: 'standard', playerPct: 70 });
    record.recordMatch({ outcome: 'lose', difficultyId: 'standard', playerPct: 30 });
    expect(record.averagePlayerPct).toBeCloseTo(50);
  });

  it('persists across instances via localStorage', async () => {
    const { MatchRecord } = await import('../src/core/MatchRecord.js?fresh4');
    const a = new MatchRecord();
    a.recordMatch({ outcome: 'win', difficultyId: 'rookie', playerPct: 65, koPlayer: 3, koCpu: 0 });

    const b = new MatchRecord();
    expect(b.values.wins).toBe(1);
    expect(b.values.byDifficulty.rookie.wins).toBe(1);
    expect(b.averagePlayerPct).toBeCloseTo(65);
  });

  it('falls back to a fresh record on corrupt stored JSON rather than throwing', async () => {
    localStorage.setItem('chromaDuel.record.v1', '{not valid json');
    const { MatchRecord } = await import('../src/core/MatchRecord.js?fresh5');
    expect(() => new MatchRecord()).not.toThrow();
    const record = new MatchRecord();
    expect(record.totalMatches).toBe(0);
  });

  it('sanitizes negative/non-numeric stored fields instead of trusting them blindly', async () => {
    localStorage.setItem(
      'chromaDuel.record.v1',
      JSON.stringify({ wins: -5, losses: 'oops', draws: 2, byDifficulty: { standard: { wins: -1, losses: 2, draws: 'x' } } }),
    );
    const { MatchRecord } = await import('../src/core/MatchRecord.js?fresh6');
    const record = new MatchRecord();
    expect(record.values.wins).toBe(0);
    expect(record.values.losses).toBe(0);
    expect(record.values.draws).toBe(2);
    expect(record.values.byDifficulty.standard).toEqual({ wins: 0, losses: 2, draws: 0 });
  });
});
