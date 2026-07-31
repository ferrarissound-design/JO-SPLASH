import { TEAM } from '../config.js';

export const MATCH_RULES = Object.freeze({
  turf: Object.freeze({ id: 'turf', label: 'TURF WAR', description: 'Paint more ground than the rival.' }),
  zone: Object.freeze({ id: 'zone', label: 'ZONE HOLD', description: 'Control the center zone for 20 seconds.' }),
  ko: Object.freeze({ id: 'ko', label: 'KO RUSH', description: 'First to 5 KOs, or most KOs at time up.' }),
});

export const ZONE_TARGET_SECONDS = 20;
export const KO_TARGET = 5;

export function getZoneOwner(ownerGrid, resolution, radiusCells = Math.max(2, Math.round(resolution * 0.13))) {
  if (!ownerGrid?.length || !Number.isInteger(resolution) || resolution <= 0) return null;
  const center = (resolution - 1) / 2;
  let player = 0;
  let cpu = 0;
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const dx = x - center;
      const dz = z - center;
      if (dx * dx + dz * dz > radiusCells * radiusCells) continue;
      const owner = ownerGrid[z * resolution + x];
      if (owner === 1) player++;
      else if (owner === 2) cpu++;
    }
  }
  const painted = player + cpu;
  if (painted < radiusCells * radiusCells * 0.35) return null;
  if (player === cpu) return null;
  return player > cpu ? TEAM.PLAYER : TEAM.CPU;
}

export function resolveRuleOutcome(ruleId, {
  coverage,
  koPlayer = 0,
  koCpu = 0,
  zonePlayer = 0,
  zoneCpu = 0,
  forcedWinnerTeam = null,
} = {}) {
  if (forcedWinnerTeam) return forcedWinnerTeam === TEAM.PLAYER ? 'win' : 'lose';
  if (ruleId === 'ko') {
    return koPlayer === koCpu ? 'draw' : (koPlayer > koCpu ? 'win' : 'lose');
  }
  if (ruleId === 'zone') {
    return zonePlayer === zoneCpu ? 'draw' : (zonePlayer > zoneCpu ? 'win' : 'lose');
  }
  const playerCells = coverage?.playerCells ?? 0;
  const cpuCells = coverage?.cpuCells ?? 0;
  return playerCells === cpuCells ? 'draw' : (playerCells > cpuCells ? 'win' : 'lose');
}

