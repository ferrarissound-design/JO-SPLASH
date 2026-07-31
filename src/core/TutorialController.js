export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    id: 'move',
    title: 'MOVE',
    instruction: 'Use WASD or the left stick and move away from the spawn point.',
  }),
  Object.freeze({
    id: 'fire',
    title: 'FIRE',
    instruction: 'Aim at the floor and fire your main weapon.',
  }),
  Object.freeze({
    id: 'jump',
    title: 'JUMP',
    instruction: 'Press Space, A, or JUMP to leap.',
  }),
  Object.freeze({
    id: 'sub',
    title: 'SUB WEAPON',
    instruction: 'Press E, B, or the SUB button to deploy your selected sub weapon.',
  }),
  Object.freeze({
    id: 'jumpPad',
    title: 'JUMP PAD',
    instruction: 'Step onto a glowing launch pad to complete training.',
  }),
]);

export class TutorialController {
  constructor() {
    this.active = false;
    this.index = 0;
  }

  get step() {
    return this.active ? TUTORIAL_STEPS[this.index] ?? null : null;
  }

  get progress() {
    return this.active ? `${this.index + 1}/${TUTORIAL_STEPS.length}` : '';
  }

  start() {
    this.active = true;
    this.index = 0;
    return this.step;
  }

  stop() {
    this.active = false;
  }

  update({
    movedDistance = 0,
    shotsFired = 0,
    airborne = false,
    subWeaponsUsed = 0,
    jumpPadAirborne = false,
  } = {}) {
    if (!this.active || !this.step) return { advanced: false, completed: false, step: null };

    const passed = {
      move: movedDistance >= 2.5,
      fire: shotsFired >= 1,
      jump: airborne,
      sub: subWeaponsUsed >= 1,
      jumpPad: jumpPadAirborne,
    }[this.step.id];

    if (!passed) return { advanced: false, completed: false, step: this.step };

    this.index++;
    if (this.index >= TUTORIAL_STEPS.length) {
      this.active = false;
      return { advanced: true, completed: true, step: null };
    }
    return { advanced: true, completed: false, step: this.step };
  }
}
