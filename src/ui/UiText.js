export const UI_TEXT_JA = Object.freeze({
  outcome: Object.freeze({
    win: '勝利',
    lose: '敗北',
    draw: '引き分け',
  }),
  cupResult: Object.freeze({
    win: '勝利',
    lose: '敗北',
    draw: '引き分け',
  }),
  rankName: Object.freeze({
    ROOKIE: 'ルーキー',
    SPLASHER: 'スプラッシャー',
    'INK RIDER': 'インクライダー',
    'ZONE ACE': 'ゾーンエース',
    'RIVAL HUNTER': 'ライバルハンター',
    'CHROMA LEGEND': 'クロマレジェンド',
  }),
  battleRankTitle: Object.freeze({
    'TURF LEGEND': 'ナワバリレジェンド',
    'INK ACE': 'インクエース',
    'SPLASH FIGHTER': 'スプラッシュファイター',
    'ROOKIE RIDER': 'ルーキーライダー',
    'PRACTICE COMPLETE': '練習完了',
  }),
  equipment: Object.freeze({
    STREAM: '連射',
    SPREAD: '拡散',
    PRECISION: '精密',
    'INK BOMB': 'インクボム',
    'INK MINE': 'インクマイン',
    'SPLASH WALL': 'スプラッシュウォール',
    'INK BURST': 'インクバースト',
    'INK RAIN': 'インクレイン',
    'COLOR SHIELD': 'カラーシールド',
  }),
  best: Object.freeze({
    playerPct: '塗装率',
    koPlayer: '撃破数',
    zoneHoldSec: 'ゾーン確保時間',
    bestCombo: '連続命中',
    battleScore: 'バトルスコア',
  }),
  mvp: Object.freeze({
    zone: 'ゾーン制圧',
    ko: '撃破ラッシュ',
    turf: 'ナワバリ制圧',
    combo: '連続攻撃',
    allRound: 'オールラウンド',
  }),
});

export function toJapaneseRankName(name = '') {
  return UI_TEXT_JA.rankName[name] ?? name;
}

export function toJapaneseBattleRankTitle(title = '') {
  return UI_TEXT_JA.battleRankTitle[title] ?? title;
}

export function toJapaneseEquipmentName(name = '') {
  return UI_TEXT_JA.equipment[name] ?? name;
}

export function toJapaneseBestLabel(key = '') {
  return UI_TEXT_JA.best[key] ?? key;
}

export function toJapaneseMvpLabel(key = '') {
  return UI_TEXT_JA.mvp[key] ?? UI_TEXT_JA.mvp.allRound;
}

export function getComboLabel(count = 0) {
  if (count >= 8) return 'インクラッシュ';
  if (count >= 5) return '連続ヒット';
  if (count >= 3) return 'トリプルヒット';
  return 'ヒットコンボ';
}
