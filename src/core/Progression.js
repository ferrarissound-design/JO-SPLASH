const STORAGE_KEY = 'chromaDuel.progression.v1';

export const REWARDS = Object.freeze({
  aquaTrail: Object.freeze({ id: 'aquaTrail', label: 'AQUA TRAIL', labelJa: 'アクアトレイル', slot: 'trail' }),
  skyAce: Object.freeze({ id: 'skyAce', label: 'SKY ACE TITLE', labelJa: 'スカイエース称号', slot: 'title' }),
  comboGlow: Object.freeze({ id: 'comboGlow', label: 'COMBO GLOW', labelJa: 'コンボグロウ', slot: 'effect' }),
  goldChampion: Object.freeze({ id: 'goldChampion', label: 'GOLD CHAMPION', labelJa: 'ゴールドチャンピオン', slot: 'theme' }),
  neonCyan: Object.freeze({ id: 'neonCyan', label: 'NEON CYAN', labelJa: 'ネオンシアン', slot: 'theme' }),
  streetLegend: Object.freeze({ id: 'streetLegend', label: 'STREET LEGEND', labelJa: 'ストリートレジェンド', slot: 'title' }),
  rankPulse: Object.freeze({ id: 'rankPulse', label: 'RANK PULSE', labelJa: 'ランクパルス', slot: 'effect' }),
  // Gear powers are the only rewards with real gameplay effects (see
  // GEAR_POWERS in config.js) rather than purely cosmetic ones; only one can
  // be equipped at a time, same as the other single-value slots above.
  aquaRevival: Object.freeze({ id: 'aquaRevival', label: 'AQUA REVIVAL GEAR', labelJa: 'アクアリバイバル', slot: 'gear' }),
  quickRespawn: Object.freeze({ id: 'quickRespawn', label: 'QUICK RESPAWN GEAR', labelJa: 'クイックリスポーン', slot: 'gear' }),
  surfBoost: Object.freeze({ id: 'surfBoost', label: 'SURF BOOST GEAR', labelJa: 'サーフブースト', slot: 'gear' }),
});

export const CHALLENGES = Object.freeze([
  Object.freeze({ id: 'painter', label: 'TURF ARTIST', labelJa: 'ナワバリアーティスト', description: 'Reach 60% turf coverage.', reward: 'AQUA TRAIL', rewardJa: 'アクアトレイル', rewardId: 'aquaTrail' }),
  Object.freeze({ id: 'aerial', label: 'SKY HUNTER', labelJa: 'スカイハンター', description: 'Land 3 SKY SPLASH hits.', reward: 'SKY ACE TITLE', rewardJa: 'スカイエース称号', rewardId: 'skyAce' }),
  Object.freeze({ id: 'combo', label: 'COMBO MAKER', labelJa: 'コンボマスター', description: 'Reach a 5-hit combo.', reward: 'COMBO GLOW', rewardJa: 'コンボグロウ', rewardId: 'comboGlow' }),
  Object.freeze({ id: 'champion', label: 'CUP CHAMPION', labelJa: 'カップチャンピオン', description: 'Win a Rival Cup.', reward: 'GOLD CHAMPION', rewardJa: 'ゴールドチャンピオン', rewardId: 'goldChampion' }),
  Object.freeze({ id: 'survivor', label: 'FLAWLESS VICTORY', labelJa: 'ノーデス勝利', description: 'Win a match without being KO\'d.', reward: 'AQUA REVIVAL GEAR', rewardJa: 'アクアリバイバル', rewardId: 'aquaRevival' }),
  Object.freeze({ id: 'comeback', label: 'COMEBACK KING', labelJa: 'カムバック', description: 'Win a match after being KO\'d 3 or more times.', reward: 'QUICK RESPAWN GEAR', rewardJa: 'クイックリスポーン', rewardId: 'quickRespawn' }),
  Object.freeze({ id: 'climber', label: 'WALL RUNNER', labelJa: 'ウォールランナー', description: 'Complete 5 wall climbs in one match.', reward: 'SURF BOOST GEAR', rewardJa: 'サーフブースト', rewardId: 'surfBoost' }),
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

  evaluate({
    playerPct = 0, skySplashes = 0, bestCombo = 0, cupChampion = false,
    outcome = null, deaths = 0, climbs = 0,
  } = {}) {
    const earned = [];
    const checks = {
      painter: playerPct >= 60,
      aerial: skySplashes >= 3,
      combo: bestCombo >= 5,
      champion: cupChampion,
      survivor: outcome === 'win' && deaths === 0,
      comeback: outcome === 'win' && deaths >= 3,
      climber: climbs >= 5,
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
