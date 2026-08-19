const STORAGE_KEY = 'chromaDuel.profile.v1';

const BEST_KEYS = Object.freeze([
  'playerPct',
  'koPlayer',
  'zoneHoldSec',
  'bestCombo',
  'battleScore',
]);

export const RANK_REWARDS = Object.freeze([
  Object.freeze({ level: 2, rewardId: 'neonCyan', label: 'NEON CYAN COLOR' }),
  Object.freeze({ level: 4, rewardId: 'streetLegend', label: 'STREET LEGEND TITLE' }),
  Object.freeze({ level: 6, rewardId: 'rankPulse', label: 'RANK PULSE' }),
]);

export const RANK_NAMES = Object.freeze([
  'ROOKIE',
  'SPLASHER',
  'INK RIDER',
  'ZONE ACE',
  'RIVAL HUNTER',
  'CHROMA LEGEND',
]);

export function xpFloorForLevel(level) {
  const normalized = Math.max(1, Math.floor(Number(level) || 1));
  return 50 * (normalized - 1) * normalized;
}

export function levelFromXp(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level < 99 && safeXp >= xpFloorForLevel(level + 1)) level++;
  return level;
}

function rewardIdsBetweenLevels(levelBefore, levelAfter) {
  return RANK_REWARDS
    .filter(({ level }) => level > levelBefore && level <= levelAfter)
    .map(({ rewardId }) => rewardId);
}

function safeMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const bests = {};
    for (const key of BEST_KEYS) bests[key] = safeMetric(parsed.bests?.[key]);
    return {
      xp: Math.max(0, Math.floor(Number(parsed.xp) || 0)),
      tutorialComplete: Boolean(parsed.tutorialComplete),
      bests,
    };
  } catch {
    return {
      xp: 0,
      tutorialComplete: false,
      bests: Object.fromEntries(BEST_KEYS.map((key) => [key, 0])),
    };
  }
}

export class PlayerProfile {
  constructor() {
    this.values = load();
  }

  get level() { return levelFromXp(this.values.xp); }
  get rankName() { return RANK_NAMES[Math.min(RANK_NAMES.length - 1, this.level - 1)]; }
  get tutorialComplete() { return this.values.tutorialComplete; }
  get bests() { return { ...this.values.bests }; }

  get progress() {
    const floor = xpFloorForLevel(this.level);
    const ceiling = xpFloorForLevel(this.level + 1);
    return {
      level: this.level,
      rankName: this.rankName,
      xp: this.values.xp,
      current: this.values.xp - floor,
      required: ceiling - floor,
    };
  }

  markTutorialComplete() {
    if (this.values.tutorialComplete) return false;
    this.values.tutorialComplete = true;
    this._save();
    return true;
  }

  /** Adds flat bonus XP (e.g. daily challenge rewards) outside the per-match formula in recordMatch. */
  addXp(amount) {
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    const levelBefore = this.level;
    if (gain <= 0) {
      return {
        xpGained: 0, levelBefore, levelAfter: levelBefore, leveledUp: false,
        rankName: this.rankName, rewardIds: [], progress: this.progress,
      };
    }
    this.values.xp += gain;
    const levelAfter = this.level;
    this._save();
    return {
      xpGained: gain,
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
      rankName: this.rankName,
      rewardIds: rewardIdsBetweenLevels(levelBefore, levelAfter),
      progress: this.progress,
    };
  }

  recordMatch({
    outcome = 'draw',
    difficultyId = 'standard',
    practiceMode = false,
    playerPct = 0,
    koPlayer = 0,
    zoneHoldSec = 0,
    bestCombo = 0,
    battleScore = 0,
  } = {}) {
    const metrics = {
      playerPct: safeMetric(playerPct),
      koPlayer: safeMetric(koPlayer),
      zoneHoldSec: safeMetric(zoneHoldSec),
      bestCombo: safeMetric(bestCombo),
      battleScore: safeMetric(battleScore),
    };
    const newBests = [];
    for (const [key, value] of Object.entries(metrics)) {
      if (value <= this.values.bests[key]) continue;
      this.values.bests[key] = value;
      newBests.push(key);
    }

    const levelBefore = this.level;
    let xpGained = 0;
    if (!practiceMode) {
      const outcomeXp = outcome === 'win' ? 45 : outcome === 'draw' ? 20 : 5;
      const difficultyXp = { rookie: 0, standard: 15, elite: 30 }[difficultyId] ?? 10;
      xpGained = Math.max(1, Math.round(
        25
        + outcomeXp
        + difficultyXp
        + metrics.playerPct * 0.6
        + metrics.koPlayer * 8
        + metrics.battleScore * 0.2
      ));
      this.values.xp += xpGained;
    }
    const levelAfter = this.level;
    const rewardIds = rewardIdsBetweenLevels(levelBefore, levelAfter);
    this._save();

    return {
      xpGained,
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
      rankName: this.rankName,
      newBests,
      rewardIds,
      progress: this.progress,
    };
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Keep session progress when storage is unavailable.
    }
  }
}
