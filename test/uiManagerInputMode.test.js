// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { UIManager } from '../src/ui/UIManager.js';

function makeUi() {
  const ui = Object.create(UIManager.prototype);
  const jumpLabel = document.createElement('kbd');
  jumpLabel.dataset.gamepadControl = 'jump';
  const bombLabel = document.createElement('kbd');
  bombLabel.dataset.gamepadControl = 'bomb';
  const fireLabel = document.createElement('kbd');
  fireLabel.dataset.gamepadControl = 'fire';
  const heading = document.createElement('h2');
  ui.el = {
    howtoDesktop: document.createElement('div'),
    howtoTouch: document.createElement('div'),
    howtoGamepad: document.createElement('div'),
    howtoDesktopPause: document.createElement('div'),
    howtoTouchPause: document.createElement('div'),
    howtoGamepadPause: document.createElement('div'),
    gamepadStatus: document.createElement('div'),
    gamepadHeadings: [heading],
    gamepadLabels: [jumpLabel, bombLabel, fireLabel],
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

  it('shows Switch Pro button names for a Nintendo controller', () => {
    const ui = makeUi();
    ui.applyTouchMode(false);
    ui.setGamepadMode(
      true,
      'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
    );

    expect(ui.el.gamepadStatus.textContent).toBe('● Switch Proコントローラー接続中');
    expect(ui.el.gamepadHeadings[0].textContent).toBe('Switch Proコントローラー操作');
    expect(ui.el.gamepadLabels.map((label) => label.textContent)).toEqual(['B', 'A', 'ZR / R']);
    expect(ui.el.weaponSwitchHint.textContent).toBe('Y / 十字キー');
  });
});
