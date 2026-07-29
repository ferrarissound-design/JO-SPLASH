// Physical-key -> canonical-action-code defaults. The canonical code is
// deliberately the same string every other system already reads (Player.js,
// TouchControls) so rebinding needs no changes anywhere outside this file:
// whatever physical key is currently bound to "jump" gets translated into a
// 'Space' keydown/keyup, exactly as if Space itself had been pressed.
export const DEFAULT_KEY_BINDINGS = Object.freeze({
  moveForward: 'KeyW',
  moveBack: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  inkSurf: 'ShiftLeft',
  special: 'KeyQ',
  bomb: 'KeyE',
  weapon1: 'Digit1',
  weapon2: 'Digit2',
  weapon3: 'Digit3',
});

export const GAMEPAD = Object.freeze({
  deadzone: 0.22,
  moveThreshold: 0.28,
  lookSpeedPixelsPerSecond: 900,
});

// Standard Gamepad mapping. Values are the same canonical actions consumed by
// Player/Game, so gamepad play does not need a parallel movement/combat path.
const GAMEPAD_BUTTON_ACTIONS = Object.freeze([
  [0, 'Space'],             // A / Cross: jump
  [1, 'KeyE'],              // B / Circle: bomb
  [2, 'GamepadNextWeapon'], // X / Square: cycle main weapon
  [3, 'KeyQ'],              // Y / Triangle: special
  [4, 'ShiftLeft'],         // LB: ink surf
  [6, 'ShiftLeft'],         // LT: ink surf
  [9, 'Escape'],            // Menu / Options: pause
  [10, 'ShiftLeft'],        // L3: ink surf
  [12, 'Digit2'],           // D-pad up: spread
  [14, 'Digit1'],           // D-pad left: stream
  [15, 'Digit3'],           // D-pad right: precision
]);

// ============================================================================
// InputManager — keyboard + mouse + touch state and pointer-lock handling.
// Exposes plain state (`keys`, `mouseDown`, mouse deltas) that other systems
// poll once per frame; mouse deltas are consumed (zeroed) by
// `consumeMouseDelta()` so they never double-apply across systems.
//
// Touch input (TouchControls) drives this exact same state through the
// public `setVirtualKey`, `addLookDelta`, and `setFireHeld` methods, so
// Player/CameraController/Game never need to know whether an input came
// from a keyboard+mouse or a finger.
//
// Rebindable keys: setKeyBindings() lets a physical key other than the
// default trigger the same canonical action (see DEFAULT_KEY_BINDINGS above).
// Any physical code not part of that fixed action set (Escape, R, debug
// keys, ShiftRight, ...) always passes through untouched.
// ============================================================================
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;

    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this.keys = Object.create(null);
    this._gamepadKeys = Object.create(null);
    this._gamepadFireHeld = false;
    this.mouseDown = false;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;

    this.pointerLocked = false;
    this.gamepadConnected = false;
    this.gamepadName = '';
    this._gamepadIndex = null;
    this._lastGamepadPulseAt = -Infinity;
    /** Set by Game/UI to update input hints when a pad connects or disconnects. */
    this.onGamepadConnectionChange = null;
    this._suppressLockLostCallback = false;
    /** Set by Game to react when pointer lock is lost by the user (e.g. Esc), not by our own exitPointerLock() calls. */
    this.onLockLost = null;

    this._justPressed = Object.create(null);

    this._canonicalCodes = new Set(Object.values(DEFAULT_KEY_BINDINGS));
    this._rebindListener = null;
    this.setKeyBindings({});

    this._onKeyDown = (e) => {
      if (this._rebindListener) {
        const listener = this._rebindListener;
        this._rebindListener = null;
        listener(e.code);
        return;
      }
      const canonical = this._physicalToCanonical.get(e.code);
      if (canonical) { this.setVirtualKey(canonical, true); return; }
      if (this._canonicalCodes.has(e.code)) return; // reassigned to a different physical key; ignore the stale one
      this.setVirtualKey(e.code, true);
    };
    this._onKeyUp = (e) => {
      const canonical = this._physicalToCanonical.get(e.code);
      if (canonical) { this.setVirtualKey(canonical, false); return; }
      if (this._canonicalCodes.has(e.code)) return;
      this.setVirtualKey(e.code, false);
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this._mouseDeltaX += e.movementX || 0;
      this._mouseDeltaY += e.movementY || 0;
    };
    this._onPointerLockChange = () => {
      const wasLocked = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (!this.pointerLocked) {
        this.mouseDown = false;
        // Only user-initiated loss (Esc, alt-tab) should trigger a pause;
        // our own exitPointerLock() calls (judging/result transitions) set
        // the suppress flag first so those don't re-open a pause screen.
        if (wasLocked && !this._suppressLockLostCallback) this.onLockLost?.();
      }
      this._suppressLockLostCallback = false;
    };
    this._onContextMenu = (e) => e.preventDefault();
    this._onBlur = () => {
      // Release held keys/buttons if the window loses focus mid-action.
      this.keys = Object.create(null);
      this.mouseDown = false;
      this._releaseGamepadState();
    };
    this._onGamepadConnected = () => this.updateGamepad(0);
    this._onGamepadDisconnected = (event) => {
      if (event.gamepad?.index === this._gamepadIndex) this._setGamepad(null);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }

  requestPointerLock() {
    if (this.isTouch) return; // no pointer-lock concept on touch devices
    if (document.pointerLockElement !== this.domElement) {
      // Embedded previews and automation surfaces may reject pointer lock
      // even though the game itself can continue normally. Do not let that
      // expected capability failure trip the global boot-error screen.
      try {
        const request = this.domElement.requestPointerLock();
        request?.catch?.(() => {});
      } catch {
        // Mouse-look simply remains inactive until pointer lock is available.
      }
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.domElement) {
      this._suppressLockLostCallback = true;
      document.exitPointerLock();
    }
  }

  isDown(code) {
    return !!(this.keys[code] || this._gamepadKeys[code]);
  }

  /** True exactly once, on the frame the key transitioned from up to down. */
  wasJustPressed(code) {
    if (this._justPressed[code]) {
      this._justPressed[code] = false;
      return true;
    }
    return false;
  }

  consumeMouseDelta() {
    const dx = this._mouseDeltaX;
    const dy = this._mouseDeltaY;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
    return [dx, dy];
  }

  /** Sets a "key" state programmatically — used by both the real keyboard handler and TouchControls. */
  setVirtualKey(code, isDown) {
    if (isDown && !this.isDown(code)) this._justPressed[code] = true;
    this.keys[code] = isDown;
  }

  /**
   * Polls the standard Gamepad API and folds it into the canonical keyboard
   * actions. Call once per frame before gameplay reads input.
   */
  updateGamepad(dt) {
    const pads = this._readGamepads();
    const pad = (
      this._gamepadIndex !== null
        ? pads.find((candidate) => candidate?.connected && candidate.index === this._gamepadIndex)
        : null
    ) || pads.find((candidate) => candidate?.connected);

    this._setGamepad(pad || null);
    if (!pad) return;

    const pressed = (index) => {
      const button = pad.buttons?.[index];
      return !!(button && (button.pressed || button.value > 0.55));
    };
    for (const [buttonIndex, action] of GAMEPAD_BUTTON_ACTIONS) {
      this._setGamepadKey(action, pressed(buttonIndex));
    }

    const axis = (index) => {
      const value = Number(pad.axes?.[index]) || 0;
      return Math.abs(value) >= GAMEPAD.deadzone ? value : 0;
    };
    const moveX = axis(0);
    const moveY = axis(1);
    this._setGamepadKey('KeyA', moveX < -GAMEPAD.moveThreshold);
    this._setGamepadKey('KeyD', moveX > GAMEPAD.moveThreshold);
    this._setGamepadKey('KeyW', moveY < -GAMEPAD.moveThreshold);
    this._setGamepadKey('KeyS', moveY > GAMEPAD.moveThreshold);

    this._gamepadFireHeld = pressed(7) || pressed(5); // RT or RB
    this.addLookDelta(
      axis(2) * GAMEPAD.lookSpeedPixelsPerSecond * dt,
      axis(3) * GAMEPAD.lookSpeedPixelsPerSecond * dt,
    );
  }

  /**
   * Plays optional controller haptics without making gameplay depend on them.
   * Supports the modern dual-rumble API and the older single-channel pulse API.
   */
  async pulseGamepad({
    duration = 60,
    weakMagnitude = 0.2,
    strongMagnitude = 0.1,
    minInterval = 45,
    force = false,
  } = {}) {
    if (!this.gamepadConnected || this._gamepadIndex === null) return false;
    const pad = this._readGamepads().find(
      (candidate) => candidate?.connected && candidate.index === this._gamepadIndex,
    );
    const actuator = pad?.vibrationActuator || pad?.hapticActuators?.[0];
    if (!actuator) return false;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && now - this._lastGamepadPulseAt < Math.max(0, minInterval)) return false;

    const clampMagnitude = (value) => Math.max(0, Math.min(1, Number(value) || 0));
    const safeDuration = Math.max(0, Math.min(1000, Number(duration) || 0));
    // Reserve the interval before awaiting the browser API so rapid-fire
    // calls cannot all slip through while the first effect is still pending.
    this._lastGamepadPulseAt = now;
    try {
      let result;
      if (typeof actuator.playEffect === 'function') {
        result = await actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: safeDuration,
          weakMagnitude: clampMagnitude(weakMagnitude),
          strongMagnitude: clampMagnitude(strongMagnitude),
        });
      } else if (typeof actuator.pulse === 'function') {
        result = await actuator.pulse(
          Math.max(clampMagnitude(weakMagnitude), clampMagnitude(strongMagnitude)),
          safeDuration,
        );
      } else {
        return false;
      }
      return result !== false;
    } catch {
      // Haptics are optional and some browsers expose an actuator that still
      // rejects effects; never let that interrupt input or the game loop.
      return false;
    }
  }

  _readGamepads() {
    if (typeof navigator.getGamepads !== 'function') return [];
    try {
      return Array.from(navigator.getGamepads() || []);
    } catch {
      return [];
    }
  }

  _setGamepad(pad) {
    const nextIndex = pad?.index ?? null;
    const nextName = pad?.id || '';
    const changed = nextIndex !== this._gamepadIndex || nextName !== this.gamepadName;
    this._gamepadIndex = nextIndex;
    this.gamepadConnected = !!pad;
    this.gamepadName = nextName;
    if (!pad) this._releaseGamepadState();
    if (changed) this.onGamepadConnectionChange?.(this.gamepadConnected, this.gamepadName);
  }

  _setGamepadKey(code, isDown) {
    if (isDown && !this.isDown(code)) this._justPressed[code] = true;
    this._gamepadKeys[code] = isDown;
  }

  _releaseGamepadState() {
    this._gamepadKeys = Object.create(null);
    this._gamepadFireHeld = false;
  }

  /** Merges action->physicalCode overrides onto the defaults and rebuilds the reverse lookup. */
  setKeyBindings(overrides = {}) {
    this.keyBindings = { ...DEFAULT_KEY_BINDINGS, ...overrides };
    this._physicalToCanonical = new Map();
    for (const action of Object.keys(DEFAULT_KEY_BINDINGS)) {
      const physical = this.keyBindings[action] ?? DEFAULT_KEY_BINDINGS[action];
      const canonical = DEFAULT_KEY_BINDINGS[action];
      this._physicalToCanonical.set(physical, canonical);
    }
  }

  /**
   * Captures the next physical keydown instead of applying it as gameplay
   * input, for a settings-screen "press a key to rebind" flow. Calls back
   * with the captured e.code once, then stops listening automatically.
   */
  listenForNextKey(callback) {
    this._rebindListener = callback;
  }

  /** Aborts an in-progress listenForNextKey() without capturing anything. */
  cancelKeyListen() {
    this._rebindListener = null;
  }

  /** Feeds a look-drag delta (in CSS pixels) into the same accumulator mouse movement uses. */
  addLookDelta(dx, dy) {
    this._mouseDeltaX += dx;
    this._mouseDeltaY += dy;
  }

  /** Used by the on-screen fire button — sets the exact same flag a held left mouse button would. */
  setFireHeld(isHeld) {
    this.mouseDown = isHeld;
  }

  get fireHeld() {
    return this.mouseDown || this._gamepadFireHeld;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
  }
}
