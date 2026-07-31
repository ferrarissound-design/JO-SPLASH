const STORAGE_KEY = 'chromaDuel.cup.v1';

export const RIVALS = Object.freeze([
  Object.freeze({
    id: 'mako',
    name: 'MAKO RUSH',
    nameJa: 'マコ・ラッシュ',
    tagline: 'Fast flanker · relentless pressure',
    taglineJa: '高速で攻め続けるアタッカー',
    color: '#ff7a2f',
    introLine: 'Try to keep up. I never take the same route twice.',
    introLineJa: 'ついてこられる？ 同じルートは二度と使わないよ。',
    winLine: 'Fast is nothing without control. You earned that one.',
    winLineJa: '速さだけじゃ勝てないか。今回はあなたの勝ち。',
    loseLine: 'Too slow. The harbor belongs to MAKO.',
    loseLineJa: '遅すぎるね。この港はマコのもの。',
    difficultyId: 'rookie',
    appearanceType: 0,
    stageId: 'harbor',
    tactics: Object.freeze({ aggression: 1.15, objectiveBias: 1.05, retreatBias: 0.8 }),
  }),
  Object.freeze({
    id: 'vanta',
    name: 'VANTA WALL',
    nameJa: 'ヴァンタ・ウォール',
    tagline: 'Zone keeper · patient counterplay',
    taglineJa: 'ゾーンを守り反撃を狙うディフェンダー',
    color: '#a979ff',
    introLine: 'Every route closes eventually. Step into my zone.',
    introLineJa: 'どの道も最後には閉ざされる。私のゾーンへ来い。',
    winLine: 'You broke the pattern. I will remember that.',
    winLineJa: '守りを崩したか。その戦い方、覚えておこう。',
    loseLine: 'Pressure fades. My defense does not.',
    loseLineJa: '攻めは途切れる。だが私の守りは途切れない。',
    difficultyId: 'standard',
    appearanceType: 2,
    stageId: 'vertical',
    tactics: Object.freeze({ aggression: 0.9, objectiveBias: 1.3, retreatBias: 1.2 }),
  }),
  Object.freeze({
    id: 'prism',
    name: 'PRISM ZERO',
    nameJa: 'プリズム・ゼロ',
    tagline: 'Elite adaptive champion',
    taglineJa: '戦い方を変化させる最強チャンピオン',
    color: '#fff27a',
    introLine: 'Final round. Show me every color you have.',
    introLineJa: '最終ラウンドだ。君のすべての色を見せてみろ。',
    winLine: 'A new champion shines. Guard the crown well.',
    winLineJa: '新たな王者の誕生だ。その冠を守り抜け。',
    loseLine: 'The crown stays here. Return when your colors burn brighter.',
    loseLineJa: '冠はここに残る。もっと鮮やかになって戻ってこい。',
    difficultyId: 'elite',
    appearanceType: 3,
    stageId: 'vertical',
    tactics: Object.freeze({ aggression: 1.3, objectiveBias: 1.4, retreatBias: 0.95 }),
  }),
]);

function loadRun() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed?.active || !Number.isInteger(parsed.roundIndex)) return null;
    return {
      active: true,
      roundIndex: Math.max(0, Math.min(RIVALS.length - 1, parsed.roundIndex)),
      results: Array.isArray(parsed.results) ? parsed.results.slice(0, RIVALS.length) : [],
    };
  } catch {
    return null;
  }
}

export class CupController {
  constructor() {
    this.run = loadRun();
  }

  get active() { return Boolean(this.run?.active); }
  get resumeAvailable() { return this.active; }
  get round() { return this.active ? this.run.roundIndex + 1 : 0; }
  get wins() { return this.run?.results.filter((result) => result === 'win').length ?? 0; }
  get results() { return [...(this.run?.results ?? [])]; }
  get currentRival() { return this.active ? RIVALS[this.run.roundIndex] : null; }
  get isFinalRound() { return this.round === RIVALS.length; }
  get champion() { return this.isFinalRound && this.wins >= 2; }

  start() {
    this.run = { active: true, roundIndex: 0, results: [] };
    this._save();
    return this.currentRival;
  }

  resume() {
    this.run = loadRun();
    return this.currentRival;
  }

  recordResult(outcome) {
    if (!this.active) return;
    if (this.run.results.length <= this.run.roundIndex) this.run.results.push(outcome);
    else this.run.results[this.run.roundIndex] = outcome;
    this._save();
  }

  advance() {
    if (!this.active || this.isFinalRound) return null;
    this.run.roundIndex++;
    this._save();
    return this.currentRival;
  }

  finish() {
    const summary = { wins: this.wins, results: this.results, champion: this.champion };
    this.run = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    return summary;
  }

  abandon() {
    this.run = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.run)); } catch {}
  }
}
