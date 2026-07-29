import { describe, it, expect } from 'vitest';
import { isSuddenDeathTie, getSuddenDeathLeader } from '../src/core/SuddenDeath.js';
import { TEAM } from '../src/config.js';

describe('isSuddenDeathTie', () => {
  it('is true when coverage is within the margin, inclusive of the boundary', () => {
    expect(isSuddenDeathTie(50, 50, 3)).toBe(true);
    expect(isSuddenDeathTie(51.5, 48.5, 3)).toBe(true);
    expect(isSuddenDeathTie(53, 50, 3)).toBe(true); // exactly on the margin
  });

  it('is false once the gap exceeds the margin, on either side', () => {
    expect(isSuddenDeathTie(53.1, 46.9, 3)).toBe(false);
    expect(isSuddenDeathTie(30, 70, 3)).toBe(false);
  });

  it('falls back to config.MATCH.suddenDeathMarginPct when no margin is given', () => {
    expect(isSuddenDeathTie(51, 49)).toBe(true);
    expect(isSuddenDeathTie(10, 90)).toBe(false);
  });

  it('sanitizes non-finite input instead of throwing', () => {
    expect(isSuddenDeathTie(Number.NaN, 50, 3)).toBe(false);
    expect(isSuddenDeathTie(undefined, undefined, 3)).toBe(true);
  });
});

describe('getSuddenDeathLeader', () => {
  it('returns null while the gap stays within the margin', () => {
    expect(getSuddenDeathLeader(50, 50, 3)).toBeNull();
    expect(getSuddenDeathLeader(53, 50, 3)).toBeNull(); // exactly on the margin
  });

  it('returns the team that has broken the tie beyond the margin', () => {
    expect(getSuddenDeathLeader(53.1, 46.9, 3)).toBe(TEAM.PLAYER);
    expect(getSuddenDeathLeader(46.9, 53.1, 3)).toBe(TEAM.CPU);
  });

  it('uses the configured default margin when none is passed', () => {
    expect(getSuddenDeathLeader(60, 40)).toBe(TEAM.PLAYER);
  });
});
