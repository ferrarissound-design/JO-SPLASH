import { TEAM, MATCH } from '../config.js';

const safeNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

// ============================================================================
// SuddenDeath — pure decision logic for the "too close to call" overtime
// rule. Kept free of Game/UI/Three so it can be unit tested the same way as
// BattleRank and PaintGrid.
// ============================================================================

/**
 * True when regulation time has run out with the two sides' floor coverage
 * within `marginPct` of each other — too close to call a fair winner off the
 * clock alone, so the match should continue into overtime instead of ending
 * in an effectively arbitrary win/draw.
 */
export function isSuddenDeathTie(playerPct, cpuPct, marginPct = MATCH.suddenDeathMarginPct) {
  return Math.abs(safeNumber(playerPct) - safeNumber(cpuPct)) <= safeNumber(marginPct);
}

/**
 * During overtime, returns the team that has broken the tie by more than
 * `marginPct` of coverage (the match should end immediately in their favor),
 * or null while the gap is still within the tie threshold.
 */
export function getSuddenDeathLeader(playerPct, cpuPct, marginPct = MATCH.suddenDeathMarginPct) {
  const diff = safeNumber(playerPct) - safeNumber(cpuPct);
  const margin = safeNumber(marginPct);
  if (diff > margin) return TEAM.PLAYER;
  if (-diff > margin) return TEAM.CPU;
  return null;
}
