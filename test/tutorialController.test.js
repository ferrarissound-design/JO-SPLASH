import { describe, expect, it } from 'vitest';
import { TutorialController, TUTORIAL_STEPS } from '../src/core/TutorialController.js';

describe('TutorialController', () => {
  it('advances through live gameplay signals in order', () => {
    const tutorial = new TutorialController();
    expect(tutorial.start().id).toBe('move');
    expect(tutorial.step.title).toBe('移動');
    expect(tutorial.step.instruction).toContain('スタート地点');
    expect(tutorial.update({ movedDistance: 2 }).advanced).toBe(false);
    expect(tutorial.update({ movedDistance: 3 }).step.id).toBe('fire');
    expect(tutorial.update({ shotsFired: 1 }).step.id).toBe('jump');
    expect(tutorial.update({ airborne: true }).step.id).toBe('sub');
    expect(tutorial.update({ subWeaponsUsed: 1 }).step.id).toBe('jumpPad');
    expect(tutorial.update({ jumpPadAirborne: true })).toMatchObject({ completed: true });
    expect(tutorial.active).toBe(false);
    expect(TUTORIAL_STEPS).toHaveLength(5);
  });
});
