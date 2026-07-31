import { describe, expect, it } from 'vitest';
import { TEAM } from '../src/config.js';
import { chooseRuleDirective } from '../src/entities/EnemyAI.js';

describe('chooseRuleDirective', () => {
  it('prioritizes a lost center zone', () => {
    expect(chooseRuleDirective({
      ruleId: 'zone',
      zoneOwner: TEAM.PLAYER,
      zonePlayer: 8,
      zoneCpu: 3,
      timeRemaining: 50,
    }, { objectiveBias: 1.2 })).toMatchObject({ type: 'zone', intent: 'RECLAIM ZONE' });
  });

  it('chases a KO when behind late in the match', () => {
    expect(chooseRuleDirective({
      ruleId: 'ko',
      koPlayer: 3,
      koCpu: 2,
      timeRemaining: 20,
    }, { hasLineOfSight: true, distanceToPlayer: 20 })).toMatchObject({ type: 'attack', intent: 'CHASE KO' });
  });

  it('protects a KO lead when health is low', () => {
    expect(chooseRuleDirective({
      ruleId: 'ko',
      koPlayer: 1,
      koCpu: 3,
      timeRemaining: 40,
    }, { cpuHp: 35 })).toMatchObject({ type: 'flee', intent: 'PROTECT LEAD' });
  });
});
