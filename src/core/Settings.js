import { CAMERA } from '../config.js';
import { DEFAULT_KEY_BINDINGS } from './InputManager.js';

// Captured once at module load, before Settings ever mutates CAMERA.sensitivity,
// so the multiplier always scales from the game's tuned default rather than
// compounding across repeated applies.
const BASE_SENSITIVITY = CAMERA.sensitivity;

const STORAGE_KEY = 'chromaDuel.settings.v1';

const DEFAULTS = Object.freeze({
  sensitivityMult: 1,
  masterVolume: 1,
  musicVolume: 1,
  difficultyId: 'standard',
  invertY: false,
  keyBindings: Object.freeze({}), // only customized actions are stored; everything else uses DEFAULT_KEY_BINDINGS
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Keeps only known action keys with a non-empty string physical code, discarding anything else. */
function sanitizeKeyBindings(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  for (const action of Object.keys(DEFAULT_KEY_BINDINGS)) {
    if (typeof raw[action] === 'string' && raw[action]) result[action] = raw[action];
  }
  return result;
}

function load() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch {
    // Storage disabled (private browsing) or corrupt JSON — fall back to defaults.
    parsed = null;
  }
  parsed ??= {};
  return {
    sensitivityMult: clampNumber(parsed.sensitivityMult, 0.4, 2.2, DEFAULTS.sensitivityMult),
    masterVolume: clampNumber(parsed.masterVolume, 0, 1, DEFAULTS.masterVolume),
    musicVolume: clampNumber(parsed.musicVolume, 0, 1, DEFAULTS.musicVolume),
    difficultyId: typeof parsed.difficultyId === 'string' ? parsed.difficultyId : DEFAULTS.difficultyId,
    invertY: typeof parsed.invertY === 'boolean' ? parsed.invertY : DEFAULTS.invertY,
    keyBindings: sanitizeKeyBindings(parsed.keyBindings),
  };
}

// ============================================================================
// Settings — small persisted user-preference store (mouse sensitivity, master
// and music volume, last-selected CPU difficulty). Written to localStorage on
// every change and re-applied at startup so a reload/return visit keeps the
// player's preferences instead of resetting to defaults every match.
// ============================================================================
export class Settings {
  constructor() {
    this.values = load();
  }

  /** Wires up the InputManager instance whose bindings this settings store controls. */
  attachInput(inputManager) {
    this._input = inputManager;
    this.apply();
  }

  /** Pushes the current values onto the live systems that read them. */
  apply() {
    CAMERA.sensitivity = BASE_SENSITIVITY * this.values.sensitivityMult;
    CAMERA.invertY = this.values.invertY;
    this._input?.setKeyBindings(this.values.keyBindings);
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Ignore — nothing useful to do if storage is unavailable.
    }
  }

  setSensitivityMult(v) {
    this.values.sensitivityMult = clampNumber(v, 0.4, 2.2, DEFAULTS.sensitivityMult);
    this.apply();
    this._save();
  }

  setMasterVolume(v) {
    this.values.masterVolume = clampNumber(v, 0, 1, DEFAULTS.masterVolume);
    this._save();
  }

  setMusicVolume(v) {
    this.values.musicVolume = clampNumber(v, 0, 1, DEFAULTS.musicVolume);
    this._save();
  }

  setDifficultyId(id) {
    this.values.difficultyId = id;
    this._save();
  }

  setInvertY(v) {
    this.values.invertY = Boolean(v);
    this.apply();
    this._save();
  }

  setKeyBinding(action, code) {
    if (!(action in DEFAULT_KEY_BINDINGS) || typeof code !== 'string' || !code) return;
    this.values.keyBindings = { ...this.values.keyBindings, [action]: code };
    this.apply();
    this._save();
  }

  resetKeyBindings() {
    this.values.keyBindings = {};
    this.apply();
    this._save();
  }
}
