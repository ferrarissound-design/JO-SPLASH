// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { RIVALS } from '../src/core/CupController.js';
import { UIManager } from '../src/ui/UIManager.js';

describe('UIManager Japanese presentation', () => {
  it('renders localized result performance and experience text', () => {
    const ui = Object.create(UIManager.prototype);
    ui.el = {
      resultLoadout: document.createElement('span'),
      resultMvp: document.createElement('strong'),
      resultBests: document.createElement('small'),
      resultXp: document.createElement('div'),
      resultLevel: document.createElement('strong'),
      resultXpGained: document.createElement('span'),
      resultXpFill: document.createElement('span'),
      resultLevelUp: document.createElement('small'),
    };

    ui.setResultPerformance({
      weaponName: 'STREAM',
      subWeaponName: 'INK BOMB',
      mvp: 'turf',
      bestLabels: ['playerPct', 'bestCombo'],
    });
    ui.setResultXp({
      visible: true,
      xpGained: 40,
      level: 2,
      rankName: 'SPLASHER',
      current: 25,
      required: 100,
      leveledUp: true,
    });

    expect(ui.el.resultLoadout.textContent).toBe('装備: 連射 + インクボム');
    expect(ui.el.resultMvp.textContent).toBe('最優秀: ナワバリ制圧');
    expect(ui.el.resultBests.textContent).toContain('自己ベスト更新: 塗装率 / 連続命中');
    expect(ui.el.resultLevel.textContent).toBe('レベル 2 · スプラッシャー');
    expect(ui.el.resultXpGained.textContent).toBe('経験値 +40');
    expect(ui.el.resultLevelUp.textContent).toContain('レベルアップ');
  });

  it('renders the rival introduction in Japanese', () => {
    const ui = Object.create(UIManager.prototype);
    ui.el = {
      rivalIntro: document.createElement('section'),
      rivalCard: document.createElement('div'),
      rivalRound: document.createElement('span'),
      rivalName: document.createElement('strong'),
      rivalTagline: document.createElement('p'),
      rivalDialogue: document.createElement('blockquote'),
    };

    ui.el.rivalIntro.classList.add('hidden');
    ui.showRivalCard({ rival: RIVALS[0], round: 1 });

    expect(ui.el.rivalRound.textContent).toBe('ライバルカップ 1/3');
    expect(ui.el.rivalName.textContent).toBe('マコ・ラッシュ');
    expect(ui.el.rivalTagline.textContent).toContain('アタッカー');
    expect(ui.el.rivalDialogue.textContent).toContain('ついてこられる');
    expect(ui.el.rivalIntro.classList.contains('hidden')).toBe(false);
  });

  it('renders the completed cup summary in Japanese', () => {
    const ui = Object.create(UIManager.prototype);
    ui.el = { cupSummary: document.createElement('div') };

    ui.setCupSummary({
      visible: true,
      results: ['win', 'lose', 'draw'],
      wins: 1,
      champion: false,
    });

    expect(ui.el.cupSummary.textContent).toContain('ライバルカップ完走');
    expect(ui.el.cupSummary.textContent).toContain('第1戦: 勝利');
    expect(ui.el.cupSummary.textContent).toContain('第2戦: 敗北');
    expect(ui.el.cupSummary.textContent).toContain('合計 1勝');
  });
});
