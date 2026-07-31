// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { UIManager } from '../src/ui/UIManager.js';

function makeUi() {
  const ui = Object.create(UIManager.prototype);
  ui.el = {
    howtoDesktop: document.createElement('div'),
    howtoTouch: document.createElement('div'),
    howtoGamepad: document.createElement('div'),
    howtoDesktopPause: document.createElement('div'),
    howtoTouchPause: document.createElement('div'),
    howtoGamepadPause: document.createElement('div'),
    gamepadStatus: document.createElement('div'),
    hud: document.createElement('div'),
    weaponSwitchHint: document.createElement('small'),
  };
  return ui;
}

describe('UIManager input help modes', () => {
  it('switches to gamepad instructions and restores desktop instructions on disconnect', () => {
    const ui = makeUi();
    ui.applyTouchMode(false);
    expect(ui.el.howtoDesktop.classList.contains('hidden')).toBe(false);
    expect(ui.el.weaponSwitchHint.textContent).toBe('1 / 2 / 3');

    ui.setGamepadMode(true, 'Test Pad');
    expect(ui.el.howtoDesktop.classList.contains('hidden')).toBe(true);
    expect(ui.el.howtoGamepad.classList.contains('hidden')).toBe(false);
    expect(ui.el.howtoGamepadPause.classList.contains('hidden')).toBe(false);
    expect(ui.el.gamepadStatus.classList.contains('hidden')).toBe(false);
    expect(ui.el.gamepadStatus.title).toBe('Test Pad');
    expect(ui.el.weaponSwitchHint.textContent).toBe('X / 十字キー');

    ui.setGamepadMode(false);
    expect(ui.el.howtoDesktop.classList.contains('hidden')).toBe(false);
    expect(ui.el.howtoGamepad.classList.contains('hidden')).toBe(true);
    expect(ui.el.gamepadStatus.classList.contains('hidden')).toBe(true);
  });

  it('restores touch instructions after a gamepad disconnects on mobile', () => {
    const ui = makeUi();
    ui.applyTouchMode(true);
    ui.setGamepadMode(true, 'Test Pad');
    ui.setGamepadMode(false);

    expect(ui.el.howtoTouch.classList.contains('hidden')).toBe(false);
    expect(ui.el.howtoTouchPause.classList.contains('hidden')).toBe(false);
    expect(ui.el.howtoDesktop.classList.contains('hidden')).toBe(true);
    expect(ui.el.weaponSwitchHint.textContent).toBe('選択');
  });
});
