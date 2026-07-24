import { describe, it, expect, beforeEach } from 'vitest';
import { CAMERA } from '../src/config.js';

/** Minimal in-memory localStorage stand-in — Settings only uses getItem/setItem. */
function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

const BASE_SENSITIVITY = CAMERA.sensitivity;

beforeEach(() => {
  globalThis.localStorage = makeMemoryStorage();
  // Settings.js re-captures "BASE_SENSITIVITY" from CAMERA.sensitivity at
  // import time; since CAMERA is a shared mutable singleton and a previous
  // test's apply() may have left it scaled, reset it to the true original
  // before every test so re-imports always baseline from the same value.
  CAMERA.sensitivity = BASE_SENSITIVITY;
});

describe('Settings defaults and persistence', () => {
  it('falls back to defaults when nothing is stored', async () => {
    const { Settings } = await import('../src/core/Settings.js?fresh1');
    const settings = new Settings();
    expect(settings.values).toEqual({
      sensitivityMult: 1,
      masterVolume: 1,
      musicVolume: 1,
      difficultyId: 'standard',
      invertY: false,
      keyBindings: {},
    });
  });

  it('setKeyBinding stores only known actions and persists across instances', async () => {
    const { Settings } = await import('../src/core/Settings.js?fresh7');
    const a = new Settings();
    a.setKeyBinding('jump', 'ArrowUp');
    a.setKeyBinding('bogusAction', 'KeyZ'); // unknown action, should be ignored

    expect(a.values.keyBindings).toEqual({ jump: 'ArrowUp' });

    const b = new Settings();
    expect(b.values.keyBindings).toEqual({ jump: 'ArrowUp' });
  });

  it('resetKeyBindings clears all customizations', async () => {
    const { Settings } = await import('../src/core/Settings.js?fresh8');
    const settings = new Settings();
    settings.setKeyBinding('jump', 'ArrowUp');
    settings.resetKeyBindings();
    expect(settings.values.keyBindings).toEqual({});
  });

  it('sanitizes stored keyBindings, dropping unknown actions and non-string codes', async () => {
    localStorage.setItem(
      'chromaDuel.settings.v1',
      JSON.stringify({ keyBindings: { jump: 'ArrowUp', special: 42, notReal: 'KeyZ' } }),
    );
    const { Settings } = await import('../src/core/Settings.js?fresh9');
    const settings = new Settings();
    expect(settings.values.keyBindings).toEqual({ jump: 'ArrowUp' });
  });

  it('setInvertY toggles CAMERA.invertY and persists', async () => {
    const { Settings } = await import('../src/core/Settings.js?fresh6');
    const a = new Settings();
    a.setInvertY(true);
    expect(CAMERA.invertY).toBe(true);

    const b = new Settings();
    expect(b.values.invertY).toBe(true);
  });

  it('round-trips a changed value through localStorage', async () => {
    const { Settings } = await import('../src/core/Settings.js?fresh2');
    const a = new Settings();
    a.setMasterVolume(0.4);
    a.setSensitivityMult(1.8);
    a.setDifficultyId('elite');

    const b = new Settings();
    expect(b.values.masterVolume).toBeCloseTo(0.4);
    expect(b.values.sensitivityMult).toBeCloseTo(1.8);
    expect(b.values.difficultyId).toBe('elite');
  });

  it('clamps out-of-range values on load instead of trusting stored JSON blindly', async () => {
    localStorage.setItem(
      'chromaDuel.settings.v1',
      JSON.stringify({ sensitivityMult: 99, masterVolume: -5, musicVolume: 5, difficultyId: 42, invertY: 'yes' }),
    );
    const { Settings } = await import('../src/core/Settings.js?fresh3');
    const settings = new Settings();

    expect(settings.values.sensitivityMult).toBeLessThanOrEqual(2.2);
    expect(settings.values.masterVolume).toBeGreaterThanOrEqual(0);
    expect(settings.values.musicVolume).toBeLessThanOrEqual(1);
    expect(settings.values.difficultyId).toBe('standard'); // non-string rejected
    expect(settings.values.invertY).toBe(false); // non-boolean rejected
  });

  it('falls back to defaults on corrupt stored JSON rather than throwing', async () => {
    localStorage.setItem('chromaDuel.settings.v1', '{not valid json');
    const { Settings } = await import('../src/core/Settings.js?fresh4');
    expect(() => new Settings()).not.toThrow();
    const settings = new Settings();
    expect(settings.values.sensitivityMult).toBe(1);
  });

  it('apply() scales CAMERA.sensitivity proportionally to the multiplier', async () => {
    const { Settings } = await import('../src/core/Settings.js?fresh5');
    const settings = new Settings();
    settings.setSensitivityMult(2);
    expect(CAMERA.sensitivity).toBeCloseTo(BASE_SENSITIVITY * 2);

    settings.setSensitivityMult(0.5);
    expect(CAMERA.sensitivity).toBeCloseTo(BASE_SENSITIVITY * 0.5);
  });
});
