import { describe, expect, it } from 'vitest';
import { STAGES, getStageSpawnDistanceDelta } from '../src/systems/Arena.js';

describe('stage definitions', () => {
  it.each(Object.values(STAGES))('$label has fair spawns and paired jump pads', (stage) => {
    expect(getStageSpawnDistanceDelta(stage)).toBeLessThan(0.01);
    expect(stage.jumpPads).toHaveLength(2);
    expect(stage.jumpPads[0].x).toBe(-stage.jumpPads[1].x);
    expect(stage.jumpPads[0].z).toBe(-stage.jumpPads[1].z);
  });
});
