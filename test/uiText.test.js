import { describe, expect, it } from 'vitest';
import {
  getComboLabel,
  toJapaneseBattleRankTitle,
  toJapaneseBestLabel,
  toJapaneseEquipmentName,
  toJapaneseMvpLabel,
  toJapaneseRankName,
} from '../src/ui/UiText.js';

describe('Japanese UI text', () => {
  it('translates equipment, ranks, battle titles, and result labels', () => {
    expect(toJapaneseEquipmentName('STREAM')).toBe('連射');
    expect(toJapaneseEquipmentName('INK BOMB')).toBe('インクボム');
    expect(toJapaneseRankName('CHROMA LEGEND')).toBe('クロマレジェンド');
    expect(toJapaneseBattleRankTitle('INK ACE')).toBe('インクエース');
    expect(toJapaneseBestLabel('zoneHoldSec')).toBe('ゾーン確保時間');
    expect(toJapaneseMvpLabel('turf')).toBe('ナワバリ制圧');
  });

  it('uses escalating Japanese combo labels', () => {
    expect(getComboLabel(2)).toBe('ヒットコンボ');
    expect(getComboLabel(3)).toBe('トリプルヒット');
    expect(getComboLabel(8)).toBe('インクラッシュ');
  });

  it('keeps unknown proper names unchanged', () => {
    expect(toJapaneseEquipmentName('CUSTOM')).toBe('CUSTOM');
  });
});
