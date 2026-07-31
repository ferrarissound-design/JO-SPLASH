import { TEAM } from '../config.js';

export const MATCH_RULES = Object.freeze({
  turf: Object.freeze({
    id: 'turf',
    label: 'TURF WAR',
    description: 'Paint more ground than the rival.',
    labelJa: 'ナワバリバトル',
    descriptionJa: '相手より広く床を塗ろう。',
  }),
  zone: Object.freeze({
    id: 'zone',
    label: 'ZONE HOLD',
    description: 'Control the center zone for 18 seconds.',
    labelJa: 'ゾーンキープ',
    descriptionJa: '中央エリアを合計18秒確保しよう。',
  }),
  ko: Object.freeze({
    id: 'ko',
    label: 'KO RUSH',
    description: 'First to 4 KOs, or most KOs at time up.',
    labelJa: 'KOラッシュ',
    descriptionJa: '先に相手を4回倒すと勝利。',
  }),
});

export const ZONE_TARGET_SECONDS = 18;
export const KO_TARGET = 4;

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

