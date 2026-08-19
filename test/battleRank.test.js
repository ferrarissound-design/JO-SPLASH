// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { calculateBattleRank } from '../src/core/BattleRank.js';
import { UIManager } from '../src/ui/UIManager.js';

describe('calculateBattleRank', () => {
  it.each([
    [
      'S',
      {
        playerPct: 60,
        cpuPct: 30,
        koPlayer: 3,
        koCpu: 0,
        outcome: 'win',
        difficultyId: 'elite',
        stats: {
          specials: { player: 3 },
          subWeapons: { player: 5 },
          climbs: { player: 4 },
          inkRolls: { player: 4 },
        },
      },
    ],
    ['A', { playerPct: 55, cpuPct: 45, koPlayer: 1, koCpu: 1, outcome: 'win', difficultyId: 'standard' }],
    ['B', { playerPct: 45, cpuPct: 45, koPlayer: 0, koCpu: 0, outcome: 'draw', difficultyId: 'standard' }],
    ['C', { playerPct: 35, cpuPct: 55, koPlayer: 0, koCpu: 2, outcome: 'lose', difficultyId: 'standard' }],
  ])('assigns the expected %s grade at representative score boundaries', (grade, input) => {
    expect(calculateBattleRank(input).grade).toBe(grade);
  });

  it('marks practice matches as unranked', () => {
    expect(calculateBattleRank({ practiceMode: true })).toEqual({
      grade: 'TRAINING',
      title: 'PRACTICE COMPLETE',
      titleJa: '練習完了',
      score: null,
      practice: true,
    });
  });

  it('sanitizes bad input and clamps scores to the 0–100 range', () => {
    expect(calculateBattleRank({ playerPct: Number.NaN, cpuPct: Infinity }).score).toBe(5);
    expect(calculateBattleRank({
      playerPct: 500,
      cpuPct: -100,
      koPlayer: 999,
      stats: {
        specials: { player: 999 },
        subWeapons: { player: 999 },
        climbs: { player: 999 },
        inkRolls: { player: 999 },
      },
      outcome: 'win',
      difficultyId: 'elite',
    }).score).toBe(100);
  });

  it('rewards SKY SPLASH technique without changing match mechanics', () => {
    const base = calculateBattleRank({ playerPct: 40, cpuPct: 40, outcome: 'draw' });
    const aerial = calculateBattleRank({
      playerPct: 40,
      cpuPct: 40,
      outcome: 'draw',
      stats: { skySplashes: { player: 3 } },
    });
    expect(aerial.score - base.score).toBe(6);
  });

  it('gives a capped presentation-only reward for the best hit combo', () => {
    const base = calculateBattleRank({ playerPct: 40, cpuPct: 40, outcome: 'draw' });
    const combo = calculateBattleRank({
      playerPct: 40,
      cpuPct: 40,
      outcome: 'draw',
      stats: { bestCombos: { player: 8 } },
    });
    const capped = calculateBattleRank({
      playerPct: 40,
      cpuPct: 40,
      outcome: 'draw',
      stats: { bestCombos: { player: 999 } },
    });
    expect(combo.score - base.score).toBe(4);
    expect(capped.score - base.score).toBe(5);
  });
});

describe('UIManager battle rank presentation', () => {
  const createUi = () => {
    const ui = Object.create(UIManager.prototype);
    ui.el = {
      resultRank: document.createElement('div'),
      resultRankGrade: document.createElement('span'),
      resultRankTitle: document.createElement('strong'),
      resultRankScore: document.createElement('small'),
    };
    return ui;
  };

  it('renders a scored grade and restarts its reveal animation', () => {
    const ui = createUi();
    ui.showBattleRank({ grade: 'A', title: 'INK ACE', score: 73, practice: false });

    expect(ui.el.resultRank.classList.contains('rank-a')).toBe(true);
    expect(ui.el.resultRank.classList.contains('pop')).toBe(true);
    expect(ui.el.resultRankGrade.textContent).toBe('A');
    expect(ui.el.resultRankTitle.textContent).toBe('インクエース');
    expect(ui.el.resultRankScore.textContent).toBe('バトルスコア 73');
  });

  it('renders practice mode without a score', () => {
    const ui = createUi();
    ui.showBattleRank({
      grade: 'TRAINING',
      title: 'PRACTICE COMPLETE',
      score: null,
      practice: true,
    });

    expect(ui.el.resultRank.classList.contains('rank-practice')).toBe(true);
    expect(ui.el.resultRankGrade.textContent).toBe('練習');
    expect(ui.el.resultRankScore.textContent).toContain('スコアなし');
  });
});

describe('UIManager hit combo presentation', () => {
  const createComboUi = () => {
    const ui = Object.create(UIManager.prototype);
    ui.el = {
      hitCombo: document.createElement('div'),
      hitComboCount: document.createElement('strong'),
      hitComboLabel: document.createElement('span'),
    };
    ui.el.hitCombo.classList.add('hidden');
    ui._hitComboTimer = 0;
    return ui;
  };

  it('reveals escalating copy from the second consecutive hit', () => {
    const ui = createComboUi();
    ui.showHitCombo(1);
    expect(ui.el.hitCombo.classList.contains('hidden')).toBe(true);

    ui.showHitCombo(3, { skySplash: true });
    expect(ui.el.hitComboCount.textContent).toBe('3×');
    expect(ui.el.hitComboLabel.textContent).toBe('トリプルヒット');
    expect(ui.el.hitCombo.classList.contains('hidden')).toBe(false);
    expect(ui.el.hitCombo.classList.contains('combo-sky')).toBe(true);
  });

  it('hides the combo callout after its UI timer expires', () => {
    const ui = createComboUi();
    ui.showHitCombo(5);
    ui.tickHitCombo(0.9);
    expect(ui.el.hitCombo.classList.contains('hidden')).toBe(true);
  });
});
