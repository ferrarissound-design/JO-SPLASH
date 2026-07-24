// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
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
