import { describe, expect, it } from 'vitest';
import { TEAM } from '../src/config.js';
import {
  MATCH_RULES,
  getZoneOwner,
  resolveRuleOutcome,
} from '../src/core/MatchRules.js';

describe('getZoneOwner', () => {
  it('returns the team with more paint in the center zone', () => {
    const grid = new Uint8Array(9 * 9);
    grid.fill(1);
    expect(getZoneOwner(grid, 9)).toBe(TEAM.PLAYER);
    grid.fill(2);
    expect(getZoneOwner(grid, 9)).toBe(TEAM.CPU);
  });

  it('returns neutral for an unpainted or tied zone', () => {
    expect(getZoneOwner(new Uint8Array(9 * 9), 9)).toBeNull();
  });
});

describe('resolveRuleOutcome', () => {
  it('provides Japanese labels for the title screen', () => {
    expect(MATCH_RULES.turf.labelJa).toBe('ナワバリバトル');
    expect(MATCH_RULES.zone.descriptionJa).toContain('18秒');
  });

  it('uses coverage for turf war', () => {
    expect(resolveRuleOutcome('turf', { coverage: { playerCells: 12, cpuCells: 8 } })).toBe('win');
  });

  it('uses hold time for zone hold', () => {
    expect(resolveRuleOutcome('zone', { zonePlayer: 8, zoneCpu: 12 })).toBe('lose');
  });

  it('uses KO score for KO rush', () => {
    expect(resolveRuleOutcome('ko', { koPlayer: 3, koCpu: 3 })).toBe('draw');
  });

  it('honors an immediate forced winner', () => {
    expect(resolveRuleOutcome('zone', { forcedWinnerTeam: TEAM.PLAYER })).toBe('win');
  });
});
