const STORAGE_KEY = 'chromaDuel.record.v1';
const KNOWN_DIFFICULTIES = ['rookie', 'standard', 'elite'];

function freshDiffStats() {
  return { wins: 0, losses: 0, draws: 0 };
}

function freshRecord() {
  const byDifficulty = {};
  for (const id of KNOWN_DIFFICULTIES) byDifficulty[id] = freshDiffStats();
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    totalPlayerPctSum: 0, // divided by match count to get the average coverage stat
    koFor: 0,
    koAgainst: 0,
    byDifficulty,
  };
}

function nonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sanitizeDiffStats(raw) {
  const fresh = freshDiffStats();
  if (!raw || typeof raw !== 'object') return fresh;
  return {
    wins: nonNegativeNumber(raw.wins),
    losses: nonNegativeNumber(raw.losses),
    draws: nonNegativeNumber(raw.draws),
  };
}

function load() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const fresh = freshRecord();
  if (!parsed || typeof parsed !== 'object') return fresh;

  const byDifficulty = {};
  for (const id of KNOWN_DIFFICULTIES) {
    byDifficulty[id] = sanitizeDiffStats(parsed.byDifficulty?.[id]);
  }

  return {
    wins: nonNegativeNumber(parsed.wins),
    losses: nonNegativeNumber(parsed.losses),
    draws: nonNegativeNumber(parsed.draws),
    totalPlayerPctSum: nonNegativeNumber(parsed.totalPlayerPctSum),
    koFor: nonNegativeNumber(parsed.koFor),
    koAgainst: nonNegativeNumber(parsed.koAgainst),
    byDifficulty,
  };
}

// ============================================================================
// MatchRecord — persisted lifetime win/loss/draw history (overall and per CPU
// difficulty), plus enough running totals to derive an average coverage %.
// Separate from Settings (user preferences) since this is derived match
// history rather than a configurable option.
// ============================================================================
export class MatchRecord {
  constructor() {
    this.values = load();
  }

  get totalMatches() {
    return this.values.wins + this.values.losses + this.values.draws;
  }

  get averagePlayerPct() {
    return this.totalMatches > 0 ? this.values.totalPlayerPctSum / this.totalMatches : 0;
  }

  recordMatch({ outcome, difficultyId, playerPct, koPlayer = 0, koCpu = 0 }) {
    const key = outcome === 'win' ? 'wins' : outcome === 'lose' ? 'losses' : 'draws';
    this.values[key]++;
    this.values.totalPlayerPctSum += Math.max(0, playerPct);
    this.values.koFor += Math.max(0, koPlayer);
    this.values.koAgainst += Math.max(0, koCpu);

    const diff = this.values.byDifficulty[difficultyId] ?? (this.values.byDifficulty[difficultyId] = freshDiffStats());
    diff[key]++;

    this._save();
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Ignore — nothing useful to do if storage is unavailable.
    }
  }
}
