import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CupController, RIVALS } from '../src/core/CupController.js';

describe('CupController', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    });
  });

  it('persists and resumes the current rival round', () => {
    expect(RIVALS.every((rival) => rival.taglineJa)).toBe(true);
    const cup = new CupController();
    expect(cup.start().id).toBe(RIVALS[0].id);
    cup.recordResult('win');
    expect(cup.advance().id).toBe(RIVALS[1].id);

    const resumed = new CupController();
    expect(resumed.resumeAvailable).toBe(true);
    expect(resumed.round).toBe(2);
    expect(resumed.wins).toBe(1);
  });

  it('produces a champion summary after two wins', () => {
    const cup = new CupController();
    cup.start();
    cup.recordResult('win');
    cup.advance();
    cup.recordResult('lose');
    cup.advance();
    cup.recordResult('win');
    expect(cup.champion).toBe(true);
    expect(cup.finish()).toEqual({ wins: 2, results: ['win', 'lose', 'win'], champion: true });
    expect(cup.resumeAvailable).toBe(false);
  });
});
