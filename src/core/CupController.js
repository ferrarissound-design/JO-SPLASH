const STORAGE_KEY = 'chromaDuel.cup.v1';

export const RIVALS = Object.freeze([
  Object.freeze({
    id: 'mako',
    name: 'MAKO RUSH',
    tagline: 'Fast flanker · relentless pressure',
    color: '#ff7a2f',
    introLine: 'Try to keep up. I never take the same route twice.',
    winLine: 'Fast is nothing without control. You earned that one.',
    loseLine: 'Too slow. The harbor belongs to MAKO.',
    difficultyId: 'rookie',
    appearanceType: 0,
    stageId: 'harbor',
    tactics: Object.freeze({ aggression: 1.15, objectiveBias: 1.05, retreatBias: 0.8 }),
  }),
  Object.freeze({
    id: 'vanta',
    name: 'VANTA WALL',
    tagline: 'Zone keeper · patient counterplay',
    color: '#a979ff',
    introLine: 'Every route closes eventually. Step into my zone.',
    winLine: 'You broke the pattern. I will remember that.',
    loseLine: 'Pressure fades. My defense does not.',
    difficultyId: 'standard',
    appearanceType: 2,
    stageId: 'vertical',
    tactics: Object.freeze({ aggression: 0.9, objectiveBias: 1.3, retreatBias: 1.2 }),
  }),
  Object.freeze({
    id: 'prism',
    name: 'PRISM ZERO',
    tagline: 'Elite adaptive champion',
    color: '#fff27a',
    introLine: 'Final round. Show me every color you have.',
    winLine: 'A new champion shines. Guard the crown well.',
    loseLine: 'The crown stays here. Return when your colors burn brighter.',
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
