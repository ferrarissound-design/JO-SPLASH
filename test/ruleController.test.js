import { describe, expect, it } from 'vitest';
import { TEAM } from '../src/config.js';
import { RuleController } from '../src/core/RuleController.js';

describe('RuleController', () => {
  it('tracks center control and declares a zone winner', () => {
    const controller = new RuleController('zone');
    const ownerGrid = new Uint8Array(9 * 9);
    ownerGrid.fill(2);
    const winner = controller.update(18.1, { paintSystem: { ownerGrid, gridRes: 9 } });
    expect(winner).toBe(TEAM.CPU);
    expect(controller.getObjectiveText()).toContain('18秒');
  });

  it('declares the first side to four KOs', () => {
    const controller = new RuleController('ko');
    expect(controller.update(0.1, { koPlayer: 4, koCpu: 2 })).toBe(TEAM.PLAYER);
    expect(controller.resolveOutcome({ koPlayer: 4, koCpu: 2 })).toBe('win');
  });

  it('builds a complete AI objective snapshot', () => {
    const controller = new RuleController('zone');
    expect(controller.getAIContext({ timeRemaining: 25, koPlayer: 1, koCpu: 2 })).toMatchObject({
      ruleId: 'zone',
      timeRemaining: 25,
      koPlayer: 1,
      koCpu: 2,
      zoneTarget: 18,
    });
  });
});
