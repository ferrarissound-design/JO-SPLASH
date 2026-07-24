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
// ============================================================================
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;

    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    this.keys = Object.create(null);
    this.mouseDown = false;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;

    this.pointerLocked = false;
    this._suppressLockLostCallback = false;
    /** Set by Game to react when pointer lock is lost by the user (e.g. Esc), not by our own exitPointerLock() calls. */
    this.onLockLost = null;

    this._justPressed = Object.create(null);

    this._onKeyDown = (e) => {
      this.setVirtualKey(e.code, true);
    };
    this._onKeyUp = (e) => {
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
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('blur', this._onBlur);
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
    return !!this.keys[code];
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
    if (isDown && !this.keys[code]) this._justPressed[code] = true;
    this.keys[code] = isDown;
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

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('blur', this._onBlur);
  }
}
