import { CAMERA } from '../config.js';
import { DEFAULT_KEY_BINDINGS, resolveKeyBindings } from './InputManager.js';

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
  stageId: 'harbor',
  ruleId: 'turf',
  subWeaponId: 'bomb',
  specialId: 'burst',
  invertY: false,
  quality: 'auto',
  colorMode: 'standard',
  crosshairScale: 1,
  touchLayout: 'standard',
  keyBindings: Object.freeze({}), // only customized actions are stored; everything else uses DEFAULT_KEY_BINDINGS
});

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toOverrides(effective) {
  const result = {};
  for (const action of Object.keys(DEFAULT_KEY_BINDINGS)) {
    if (effective[action] !== DEFAULT_KEY_BINDINGS[action]) result[action] = effective[action];
  }
  return result;
}

/** Keeps known actions, repairs duplicate keys by swapping, and stores only non-default bindings. */
function sanitizeKeyBindings(raw) {
  return toOverrides(resolveKeyBindings(raw));
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function stringValue(value, fallback) {
  return typeof value === 'string' && value ? value : fallback;
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
    difficultyId: stringValue(parsed.difficultyId, DEFAULTS.difficultyId),
    stageId: stringValue(parsed.stageId, DEFAULTS.stageId),
    ruleId: stringValue(parsed.ruleId, DEFAULTS.ruleId),
    subWeaponId: stringValue(parsed.subWeaponId, DEFAULTS.subWeaponId),
    specialId: stringValue(parsed.specialId, DEFAULTS.specialId),
    invertY: typeof parsed.invertY === 'boolean' ? parsed.invertY : DEFAULTS.invertY,
    quality: enumValue(parsed.quality, ['auto', 'low', 'high'], DEFAULTS.quality),
    colorMode: enumValue(
      parsed.colorMode,
      ['standard', 'deuteranopia', 'tritanopia', 'highContrast'],
      DEFAULTS.colorMode,
    ),
    crosshairScale: clampNumber(parsed.crosshairScale, 0.7, 1.6, DEFAULTS.crosshairScale),
    touchLayout: enumValue(parsed.touchLayout, ['standard', 'compact', 'leftHanded'], DEFAULTS.touchLayout),
    keyBindings: sanitizeKeyBindings(parsed.keyBindings),
  };
}

// ============================================================================
// Settings — persisted user-preference store. Alongside display/input/audio
// preferences it remembers the last title-screen battle setup so returning
// players can jump straight back into the loadout they were using.
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
    this.values.difficultyId = stringValue(id, DEFAULTS.difficultyId);
    this._save();
  }

  setStageId(id) {
    this.values.stageId = stringValue(id, DEFAULTS.stageId);
    this._save();
  }

  setRuleId(id) {
    this.values.ruleId = stringValue(id, DEFAULTS.ruleId);
    this._save();
  }

  setSubWeaponId(id) {
    this.values.subWeaponId = stringValue(id, DEFAULTS.subWeaponId);
    this._save();
  }

  setSpecialId(id) {
    this.values.specialId = stringValue(id, DEFAULTS.specialId);
    this._save();
  }

  setInvertY(v) {
    this.values.invertY = Boolean(v);
    this.apply();
    this._save();
  }

  setQuality(value) {
    this.values.quality = enumValue(value, ['auto', 'low', 'high'], DEFAULTS.quality);
    this._save();
  }

  setColorMode(value) {
    this.values.colorMode = enumValue(
      value,
      ['standard', 'deuteranopia', 'tritanopia', 'highContrast'],
      DEFAULTS.colorMode,
    );
    this._save();
  }

  setCrosshairScale(value) {
    this.values.crosshairScale = clampNumber(value, 0.7, 1.6, DEFAULTS.crosshairScale);
    this._save();
  }

  setTouchLayout(value) {
    this.values.touchLayout = enumValue(value, ['standard', 'compact', 'leftHanded'], DEFAULTS.touchLayout);
    this._save();
  }

  setKeyBinding(action, code) {
    if (!(action in DEFAULT_KEY_BINDINGS) || typeof code !== 'string' || !code) return;
    const effective = resolveKeyBindings(this.values.keyBindings);
    this.values.keyBindings = toOverrides(resolveKeyBindings({ ...effective, [action]: code }));
    this.apply();
    this._save();
  }

  resetKeyBindings() {
    this.values.keyBindings = {};
    this.apply();
    this._save();
  }
}
