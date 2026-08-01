const STORAGE_KEY = 'chromaDuel.dailyChallenges.v1';
const PICK_COUNT = 3;

// Candidate pool for the rotating daily set. Each match's flat stats object
// (see Game._endMatch) is checked against `check`; unlike the permanent
// CHALLENGES in Progression.js, these only grant bonus XP, never an
// unlockable reward, so they're safe to complete repeatedly across days.
export const DAILY_CHALLENGE_POOL = Object.freeze([
  Object.freeze({ id: 'dailyWin', labelJa: '1勝する', descriptionJa: 'CPUに1勝する。', xp: 30, check: (s) => s.outcome === 'win' }),
  Object.freeze({ id: 'dailyTurf60', labelJa: '塗装率60%', descriptionJa: '塗装率60%以上を達成する。', xp: 25, check: (s) => s.playerPct >= 60 }),
  Object.freeze({ id: 'dailyCombo4', labelJa: '4連続ヒット', descriptionJa: '4ヒット以上のコンボを決める。', xp: 20, check: (s) => s.bestCombo >= 4 }),
  Object.freeze({ id: 'dailyKO2', labelJa: '2回撃破', descriptionJa: '1試合で2回相手を倒す。', xp: 25, check: (s) => s.koPlayer >= 2 }),
  Object.freeze({ id: 'dailySub3', labelJa: 'サブウェポン3回', descriptionJa: 'サブウェポンを3回使用する。', xp: 15, check: (s) => s.subWeaponsUsed >= 3 }),
  Object.freeze({ id: 'dailySpecial1', labelJa: 'スペシャル発動', descriptionJa: 'スペシャルを1回発動する。', xp: 15, check: (s) => s.specialsUsed >= 1 }),
  Object.freeze({ id: 'dailyClimb2', labelJa: '壁登り2回', descriptionJa: '壁登りを2回成功させる。', xp: 15, check: (s) => s.climbs >= 2 }),
  Object.freeze({ id: 'dailyNoDeath', labelJa: 'ノーデス試合', descriptionJa: '一度もKOされずに試合を終える。', xp: 30, check: (s) => s.deaths === 0 }),
]);

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function seedFromString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32 — tiny deterministic PRNG so the same date key always yields
// the same picks without needing to persist the picked list itself.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministically picks PICK_COUNT unique challenges from the pool for a given date key. */
export function pickDailyChallenges(dateKey = todayKey()) {
  const rand = mulberry32(seedFromString(dateKey));
  const pool = [...DAILY_CHALLENGE_POOL];
  const picks = [];
  for (let i = 0; i < PICK_COUNT && pool.length > 0; i++) {
    const index = Math.floor(rand() * pool.length);
    picks.push(pool.splice(index, 1)[0]);
  }
  return picks;
}

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      date: typeof parsed.date === 'string' ? parsed.date : '',
      completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds : [],
    };
  } catch {
    return { date: '', completedIds: [] };
  }
}

// ============================================================================
// DailyChallenges — a rotating set of 3 challenges (see DAILY_CHALLENGE_POOL)
// that resets every UTC day. Completing one grants bonus XP added directly
// via PlayerProfile.addXp; no reward is ever unlocked here (see Progression's
// CHALLENGES for that). Only the completion state is persisted — today's set
// itself is re-derived deterministically from the date on every access.
// ============================================================================
export class DailyChallenges {
  constructor() {
    this.values = load();
    this._rollIfNewDay();
  }

  _rollIfNewDay() {
    const today = todayKey();
    if (this.values.date !== today) {
      this.values = { date: today, completedIds: [] };
      this._save();
    }
  }

  get todaysChallenges() {
    this._rollIfNewDay();
    return pickDailyChallenges(this.values.date);
  }

  get completed() {
    return new Set(this.values.completedIds);
  }

  /** Checks today's not-yet-completed challenges against a match's stats; returns newly earned ones + their total XP. */
  evaluate(stats = {}) {
    this._rollIfNewDay();
    const earned = [];
    let totalXp = 0;
    for (const challenge of this.todaysChallenges) {
      if (this.values.completedIds.includes(challenge.id)) continue;
      if (!challenge.check(stats)) continue;
      this.values.completedIds.push(challenge.id);
      totalXp += challenge.xp;
      earned.push(challenge);
    }
    if (earned.length) this._save();
    return { earned, totalXp };
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Today's completions remain valid for this session if storage is unavailable.
    }
  }
}
