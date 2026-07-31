const RANKS = Object.freeze([
  { minScore: 85, grade: 'S', title: 'TURF LEGEND', titleJa: 'ナワバリレジェンド' },
  { minScore: 70, grade: 'A', title: 'INK ACE', titleJa: 'インクエース' },
  { minScore: 50, grade: 'B', title: 'SPLASH FIGHTER', titleJa: 'スプラッシュファイター' },
  { minScore: 0, grade: 'C', title: 'ROOKIE RIDER', titleJa: 'ルーキーライダー' },
]);

const DIFFICULTY_BONUS = Object.freeze({
  rookie: 0,
  standard: 2,
  elite: 5,
});

const OUTCOME_BONUS = Object.freeze({
  win: 8,
  draw: 3,
  lose: 0,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const playerCount = (stats, key) => Math.max(0, safeNumber(stats?.[key]?.player));

/**
 * Produces a presentation-only battle grade. It never feeds gameplay,
 * matchmaking, or persistent win/loss data.
 */
export function calculateBattleRank({
  playerPct = 0,
  cpuPct = 0,
  koPlayer = 0,
  koCpu = 0,
  outcome = 'draw',
  difficultyId = 'standard',
  practiceMode = false,
  stats = null,
} = {}) {
  if (practiceMode) {
    return Object.freeze({
      grade: 'TRAINING',
      title: 'PRACTICE COMPLETE',
      titleJa: '練習完了',
      score: null,
      practice: true,
    });
  }

  const playerCoverage = clamp(safeNumber(playerPct), 0, 100);
  const coverageMargin = clamp(playerCoverage - clamp(safeNumber(cpuPct), 0, 100), -20, 20);
  const koDifference = clamp(safeNumber(koPlayer) - safeNumber(koCpu), -3, 3);
  const techniqueScore = (
    Math.min(playerCount(stats, 'specials'), 3) * 3
    + Math.min(playerCount(stats, 'bombs'), 5) * 0.75
    + Math.min(playerCount(stats, 'climbs'), 4) * 1.5
    + Math.min(playerCount(stats, 'inkRolls'), 4) * 1.5
    + Math.min(playerCount(stats, 'skySplashes'), 4) * 2
    + Math.min(playerCount(stats, 'bestCombos'), 10) * 0.5
  );

  const rawScore = (
    playerCoverage
    + coverageMargin * 0.5
    + koDifference * 4
    + techniqueScore
    + (OUTCOME_BONUS[outcome] ?? OUTCOME_BONUS.draw)
    + (DIFFICULTY_BONUS[difficultyId] ?? DIFFICULTY_BONUS.standard)
  );
  const score = Math.round(clamp(rawScore, 0, 100));
  const rank = RANKS.find((candidate) => score >= candidate.minScore) ?? RANKS[RANKS.length - 1];

  return Object.freeze({
    grade: rank.grade,
    title: rank.title,
    titleJa: rank.titleJa,
    score,
    practice: false,
  });
}
