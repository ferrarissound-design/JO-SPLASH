const STORAGE_KEY = 'chromaDuel.progression.v1';

export const REWARDS = Object.freeze({
  aquaTrail: Object.freeze({ id: 'aquaTrail', label: 'AQUA TRAIL', slot: 'trail' }),
  skyAce: Object.freeze({ id: 'skyAce', label: 'SKY ACE TITLE', slot: 'title' }),
  comboGlow: Object.freeze({ id: 'comboGlow', label: 'COMBO GLOW', slot: 'effect' }),
  goldChampion: Object.freeze({ id: 'goldChampion', label: 'GOLD CHAMPION', slot: 'theme' }),
  neonCyan: Object.freeze({ id: 'neonCyan', label: 'NEON CYAN', slot: 'theme' }),
  streetLegend: Object.freeze({ id: 'streetLegend', label: 'STREET LEGEND', slot: 'title' }),
  rankPulse: Object.freeze({ id: 'rankPulse', label: 'RANK PULSE', slot: 'effect' }),
});

export const CHALLENGES = Object.freeze([
  Object.freeze({ id: 'painter', label: 'TURF ARTIST', description: 'Reach 60% turf coverage.', reward: 'AQUA TRAIL', rewardId: 'aquaTrail' }),
  Object.freeze({ id: 'aerial', label: 'SKY HUNTER', description: 'Land 3 SKY SPLASH hits.', reward: 'SKY ACE TITLE', rewardId: 'skyAce' }),
  Object.freeze({ id: 'combo', label: 'COMBO MAKER', description: 'Reach a 5-hit combo.', reward: 'COMBO GLOW', rewardId: 'comboGlow' }),
  Object.freeze({ id: 'champion', label: 'CUP CHAMPION', description: 'Win a Rival Cup.', reward: 'GOLD CHAMPION', rewardId: 'goldChampion' }),
]);

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const unlocked = Array.isArray(parsed.unlocked) ? parsed.unlocked.filter((id) => CHALLENGES.some((c) => c.id === id)) : [];
    const rewardIds = new Set(Array.isArray(parsed.rewardIds) ? parsed.rewardIds.filter((id) => REWARDS[id]) : []);
    for (const challengeId of unlocked) {
      const challenge = CHALLENGES.find((candidate) => candidate.id === challengeId);
      if (challenge?.rewardId) rewardIds.add(challenge.rewardId);
    }
    const equipped = {};
    for (const [slot, rewardId] of Object.entries(parsed.equipped ?? {})) {
      const reward = REWARDS[rewardId];
      if (reward?.slot === slot && rewardIds.has(rewardId)) equipped[slot] = rewardId;
    }
    return { unlocked, rewardIds: [...rewardIds], equipped };
  } catch {
    return { unlocked: [], rewardIds: [], equipped: {} };
  }
}

export class Progression {
  constructor() {
    this.values = load();
  }

  get unlocked() {
    return new Set(this.values.unlocked);
  }

  get equipped() {
    return { ...this.values.equipped };
  }

  get availableRewards() {
    return new Set(this.values.rewardIds);
  }

  equip(rewardId) {
    const reward = REWARDS[rewardId];
    if (!reward || !this.values.rewardIds.includes(rewardId)) return false;
    this.values.equipped[reward.slot] = rewardId;
    this._save();
    return true;
  }

  unlockRewards(rewardIds = []) {
    const earned = [];
    for (const rewardId of rewardIds) {
      const reward = REWARDS[rewardId];
      if (!reward || this.values.rewardIds.includes(rewardId)) continue;
      this.values.rewardIds.push(rewardId);
      if (!this.values.equipped[reward.slot]) this.values.equipped[reward.slot] = reward.id;
      earned.push(reward);
    }
    if (earned.length) this._save();
    return earned;
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
      const reward = REWARDS[challenge.rewardId];
      if (reward && !this.values.rewardIds.includes(reward.id)) this.values.rewardIds.push(reward.id);
      if (reward && !this.values.equipped[reward.slot]) this.values.equipped[reward.slot] = reward.id;
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
