import { TEAM } from '../config.js';
import {
  MATCH_RULES,
  ZONE_TARGET_SECONDS,
  KO_TARGET,
  getZoneOwner,
  resolveRuleOutcome,
} from './MatchRules.js';

export class RuleController {
  constructor(ruleId = 'turf') {
    this.setRule(ruleId);
  }

  setRule(ruleId) {
    this.ruleId = MATCH_RULES[ruleId] ? ruleId : 'turf';
    this.reset();
    return this.ruleId;
  }

  reset() {
    this.zone = { player: 0, cpu: 0 };
    this.zoneOwner = null;
    this.forcedWinnerTeam = null;
  }

  update(dt, { paintSystem, koPlayer = 0, koCpu = 0 } = {}) {
    if (this.ruleId === 'zone') {
      this.zoneOwner = getZoneOwner(paintSystem?.ownerGrid, paintSystem?.gridRes);
      if (this.zoneOwner === TEAM.PLAYER) this.zone.player += dt;
      else if (this.zoneOwner === TEAM.CPU) this.zone.cpu += dt;
      if (this.zone.player >= ZONE_TARGET_SECONDS || this.zone.cpu >= ZONE_TARGET_SECONDS) {
        this.forcedWinnerTeam = this.zone.player >= ZONE_TARGET_SECONDS ? TEAM.PLAYER : TEAM.CPU;
      }
    } else if (this.ruleId === 'ko') {
      if (koPlayer >= KO_TARGET || koCpu >= KO_TARGET) {
        this.forcedWinnerTeam = koPlayer >= KO_TARGET ? TEAM.PLAYER : TEAM.CPU;
      }
    }
    return this.forcedWinnerTeam;
  }

  getObjectiveText({ koPlayer = 0, koCpu = 0 } = {}) {
    if (this.ruleId === 'zone') {
      return `ZONE HOLD · YOU ${this.zone.player.toFixed(1)} / CPU ${this.zone.cpu.toFixed(1)} · ${ZONE_TARGET_SECONDS}s`;
    }
    if (this.ruleId === 'ko') return `KO RUSH · YOU ${koPlayer} / CPU ${koCpu} · FIRST TO ${KO_TARGET}`;
    return MATCH_RULES.turf.label;
  }

  getResultSummary({ koPlayer = 0, koCpu = 0, stageLabel = '' } = {}) {
    if (this.ruleId === 'zone') return `YOU ${this.zone.player.toFixed(1)}s / CPU ${this.zone.cpu.toFixed(1)}s`;
    if (this.ruleId === 'ko') return `YOU ${koPlayer} KO / CPU ${koCpu} KO`;
    return stageLabel;
  }

  getAIContext({ timeRemaining = 0, koPlayer = 0, koCpu = 0 } = {}) {
    return {
      ruleId: this.ruleId,
      timeRemaining,
      zoneOwner: this.zoneOwner,
      zonePlayer: this.zone.player,
      zoneCpu: this.zone.cpu,
      koPlayer,
      koCpu,
      zoneTarget: ZONE_TARGET_SECONDS,
      koTarget: KO_TARGET,
    };
  }

  resolveOutcome({ coverage, koPlayer = 0, koCpu = 0, forcedWinnerTeam = null } = {}) {
    return resolveRuleOutcome(this.ruleId, {
      coverage,
      koPlayer,
      koCpu,
      zonePlayer: this.zone.player,
      zoneCpu: this.zone.cpu,
      forcedWinnerTeam: forcedWinnerTeam ?? this.forcedWinnerTeam,
    });
  }
}

