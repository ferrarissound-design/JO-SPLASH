// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { InputManager, DEFAULT_KEY_BINDINGS } from '../src/core/InputManager.js';

function press(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
}
function release(code) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

function makeInput() {
  return new InputManager(document.createElement('canvas'));
}

describe('InputManager default bindings', () => {
  it('a default physical key sets its own canonical (identical) code down/up', () => {
    const input = makeInput();
    press('KeyW');
    expect(input.isDown('KeyW')).toBe(true);
    release('KeyW');
    expect(input.isDown('KeyW')).toBe(false);
    input.dispose();
  });

  it('wasJustPressed fires exactly once per press', () => {
    const input = makeInput();
    press('Digit1');
    expect(input.wasJustPressed('Digit1')).toBe(true);
    expect(input.wasJustPressed('Digit1')).toBe(false);
    input.dispose();
  });

  it('non-canonical keys (Escape, debug keys) always pass through untouched', () => {
    const input = makeInput();
    press('Escape');
    expect(input.isDown('Escape')).toBe(true);
    input.dispose();
  });
});

describe('InputManager.setKeyBindings (rebinding)', () => {
  it('a rebound physical key triggers the canonical action code', () => {
    const input = makeInput();
    input.setKeyBindings({ jump: 'ArrowUp' });
    press('ArrowUp');
    expect(input.isDown(DEFAULT_KEY_BINDINGS.jump)).toBe(true); // isDown('Space')
    input.dispose();
  });

  it('the old default physical key is swallowed once its action has moved elsewhere', () => {
    const input = makeInput();
    input.setKeyBindings({ jump: 'ArrowUp' });
    press('Space'); // stale — jump now lives on ArrowUp
    expect(input.isDown('Space')).toBe(false);
    expect(input.isDown(DEFAULT_KEY_BINDINGS.jump)).toBe(false);
    input.dispose();
  });

  it('reverting to defaults ({}) restores the original physical key', () => {
    const input = makeInput();
    input.setKeyBindings({ jump: 'ArrowUp' });
    input.setKeyBindings({});
    press('Space');
    expect(input.isDown('Space')).toBe(true);
    input.dispose();
  });

  it('keys outside the rebindable action set are unaffected by any binding change', () => {
    const input = makeInput();
    input.setKeyBindings({ jump: 'ArrowUp' });
    press('Escape');
    expect(input.isDown('Escape')).toBe(true);
    input.dispose();
  });
});

describe('InputManager.listenForNextKey', () => {
  it('captures the next keydown instead of applying it as gameplay input', () => {
    const input = makeInput();
    let captured = null;
    input.listenForNextKey((code) => { captured = code; });

    press('KeyP');

    expect(captured).toBe('KeyP');
    expect(input.isDown('KeyP')).toBe(false); // consumed by the listener, not applied as a key state
    input.dispose();
  });

  it('only captures once, then resumes normal handling', () => {
    const input = makeInput();
    input.listenForNextKey(() => {});
    press('KeyP');
    press('KeyO');
    expect(input.isDown('KeyO')).toBe(true);
    input.dispose();
  });

  it('cancelKeyListen() aborts capture without consuming the next key', () => {
    const input = makeInput();
    let called = false;
    input.listenForNextKey(() => { called = true; });
    input.cancelKeyListen();
    press('KeyP');
    expect(called).toBe(false);
    expect(input.isDown('KeyP')).toBe(true);
    input.dispose();
  });
});

function createGamepad() {
  return {
    connected: true,
    id: 'Test Standard Gamepad',
    index: 0,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
}

describe('InputManager gamepad support', () => {
  it('maps sticks, jump, fire, and camera look into the shared input state', () => {
    const pad = createGamepad();
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });
    const input = makeInput();

    pad.axes[0] = 0.8;
    pad.axes[1] = -0.8;
    pad.axes[2] = 0.5;
    pad.axes[3] = -0.5;
    pad.buttons[0] = { pressed: true, value: 1 };
    pad.buttons[7] = { pressed: true, value: 1 };
    input.updateGamepad(1 / 60);

    expect(input.gamepadConnected).toBe(true);
    expect(input.isDown('KeyD')).toBe(true);
    expect(input.isDown('KeyW')).toBe(true);
    expect(input.wasJustPressed('Space')).toBe(true);
    expect(input.fireHeld).toBe(true);
    const [dx, dy] = input.consumeMouseDelta();
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeLessThan(0);
    input.dispose();
  });

  it('emits gamepad button edges once and rearms after release', () => {
    const pad = createGamepad();
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });
    const input = makeInput();

    pad.buttons[2] = { pressed: true, value: 1 };
    input.updateGamepad(1 / 60);
    expect(input.wasJustPressed('GamepadNextWeapon')).toBe(true);
    input.updateGamepad(1 / 60);
    expect(input.wasJustPressed('GamepadNextWeapon')).toBe(false);

    pad.buttons[2] = { pressed: false, value: 0 };
    input.updateGamepad(1 / 60);
    pad.buttons[2] = { pressed: true, value: 1 };
    input.updateGamepad(1 / 60);
    expect(input.wasJustPressed('GamepadNextWeapon')).toBe(true);
    input.dispose();
  });

  it('does not release a keyboard action when the matching gamepad action is neutral', () => {
    const pad = createGamepad();
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });
    const input = makeInput();

    press('KeyW');
    input.updateGamepad(1 / 60);
    expect(input.isDown('KeyW')).toBe(true);
    release('KeyW');
    expect(input.isDown('KeyW')).toBe(false);
    input.dispose();
  });

  it('releases held gamepad actions and reports disconnection', () => {
    const pad = createGamepad();
    let pads = [pad];
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => pads,
    });
    const input = makeInput();
    const connectionStates = [];
    input.onGamepadConnectionChange = (connected) => connectionStates.push(connected);

    pad.axes[0] = -1;
    pad.buttons[7] = { pressed: true, value: 1 };
    input.updateGamepad(1 / 60);
    expect(input.isDown('KeyA')).toBe(true);
    expect(input.fireHeld).toBe(true);

    pads = [];
    input.updateGamepad(1 / 60);
    expect(input.isDown('KeyA')).toBe(false);
    expect(input.fireHeld).toBe(false);
    expect(connectionStates).toEqual([true, false]);
    input.dispose();
  });
});

describe('InputManager gamepad haptics', () => {
  it('plays a clamped dual-rumble effect on supported controllers', async () => {
    const playEffect = vi.fn().mockResolvedValue('complete');
    const pad = {
      ...createGamepad(),
      vibrationActuator: { playEffect },
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });
    const input = makeInput();
    input.updateGamepad(0);

    await expect(input.pulseGamepad({
      duration: 2000,
      weakMagnitude: -1,
      strongMagnitude: 2,
    })).resolves.toBe(true);
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', {
      startDelay: 0,
      duration: 1000,
      weakMagnitude: 0,
      strongMagnitude: 1,
    });
    input.dispose();
  });

  it('falls back to the legacy single-channel pulse API', async () => {
    const pulse = vi.fn().mockResolvedValue(true);
    const pad = {
      ...createGamepad(),
      hapticActuators: [{ pulse }],
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });
    const input = makeInput();
    input.updateGamepad(0);

    await expect(input.pulseGamepad({
      duration: 90,
      weakMagnitude: 0.35,
      strongMagnitude: 0.6,
    })).resolves.toBe(true);
    expect(pulse).toHaveBeenCalledWith(0.6, 90);
    input.dispose();
  });

  it('is a safe no-op when haptics are unavailable or rejected', async () => {
    const pad = createGamepad();
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });
    const input = makeInput();
    input.updateGamepad(0);
    await expect(input.pulseGamepad()).resolves.toBe(false);

    pad.vibrationActuator = {
      playEffect: vi.fn().mockRejectedValue(new Error('not supported')),
    };
    await expect(input.pulseGamepad()).resolves.toBe(false);
    input.dispose();
  });
});
