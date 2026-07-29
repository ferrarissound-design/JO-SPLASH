import { describe, expect, it } from 'vitest';
import {
  characterConfigs,
  createJoRayCharacter,
  getCharacterConfig,
} from '../src/entities/PlayerAppearance.js';

describe('player appearance configuration', () => {
  it('registers both selectable player characters and falls back safely', () => {
    expect(Object.keys(characterConfigs)).toEqual(['default', 'joRay']);
    expect(getCharacterConfig('joRay').name).toBe('ジョーレイ');
    expect(getCharacterConfig('missing')).toBe(characterConfigs.default);
  });

  it('builds JO-RAY with animated fins and emissive neon materials', () => {
    const { group, materials } = createJoRayCharacter();
    const parts = group.userData.appearanceParts;

    expect(parts.finL).toBeTruthy();
    expect(parts.finR).toBeTruthy();
    expect(parts.shooter).toBeTruthy();
    expect(parts.tank).toBeTruthy();
    expect(materials.some((material) => material.emissive?.getHex() !== 0)).toBe(true);

    for (const geometry of group.userData.ownedGeometries ?? []) geometry.dispose();
    for (const material of materials) material.dispose();
  });
});
