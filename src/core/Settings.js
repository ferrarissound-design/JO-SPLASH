import { CAMERA } from '../config.js';

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
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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

  /** Pushes the current values onto the live systems that read them. */
  apply() {
    CAMERA.sensitivity = BASE_SENSITIVITY * this.values.sensitivityMult;
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
}
