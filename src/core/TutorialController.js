export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    id: 'move',
    title: '移動',
    instruction: 'WASDか左スティックで、スタート地点から移動しよう。',
  }),
  Object.freeze({
    id: 'fire',
    title: 'インク発射',
    instruction: '床を狙ってメインウェポンを撃とう。',
  }),
  Object.freeze({
    id: 'jump',
    title: 'ジャンプ',
    instruction: 'Space、A、またはジャンプボタンで跳ぼう。',
  }),
  Object.freeze({
    id: 'sub',
    title: 'サブウェポン',
    instruction: 'E、B、またはボムボタンでサブウェポンを使おう。',
  }),
  Object.freeze({
    id: 'jumpPad',
    title: 'ジャンプ台',
    instruction: '光っているジャンプ台に乗れば練習完了。',
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
