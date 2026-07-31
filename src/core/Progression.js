const STORAGE_KEY = 'chromaDuel.progression.v1';

export const CHALLENGES = Object.freeze([
  Object.freeze({ id: 'painter', label: 'TURF ARTIST', description: 'Reach 60% turf coverage.', reward: 'AQUA TRAIL' }),
  Object.freeze({ id: 'aerial', label: 'SKY HUNTER', description: 'Land 3 SKY SPLASH hits.', reward: 'SKY ACE TITLE' }),
  Object.freeze({ id: 'combo', label: 'COMBO MAKER', description: 'Reach a 5-hit combo.', reward: 'COMBO GLOW' }),
  Object.freeze({ id: 'champion', label: 'CUP CHAMPION', description: 'Win a Rival Cup.', reward: 'GOLD CHAMPION' }),
]);

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => CHALLENGES.some((c) => c.id === id)) : [] };
  } catch {
    return { unlocked: [] };
  }
}

export class Progression {
  constructor() {
    this.values = load();
  }

  get unlocked() {
    return new Set(this.values.unlocked);
  }

  evaluate({ playerPct = 0, skySplashes = 0, bestCombo = 0, cupChampion = false } = {}) {
    const earned = [];
    const checks = {
      painter: playerPct >= 60,
      aerial: skySplashes >= 3,
      combo: bestCombo >= 5,
      champion: cupChampion,
    };
    for (const challenge of CHALLENGES) {
      if (!checks[challenge.id] || this.values.unlocked.includes(challenge.id)) continue;
      this.values.unlocked.push(challenge.id);
      earned.push(challenge);
    }
    if (earned.length) this._save();
    return earned;
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Progress remains valid for this session if persistent storage is unavailable.
    }
  }
}
