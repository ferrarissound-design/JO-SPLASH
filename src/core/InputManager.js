// ============================================================================
// InputManager — keyboard + mouse state and pointer-lock handling.
// Exposes plain state (`keys`, `mouseDown`, `mouseDeltaX/Y`) that other
// systems poll once per frame; mouse deltas are consumed (zeroed) by
// `consumeMouseDelta()` so they never double-apply across systems.
// ============================================================================
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;

    this.keys = Object.create(null);
    this.mouseDown = false;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;

    this.pointerLocked = false;

    this._justPressed = Object.create(null);

    this._onKeyDown = (e) => {
      if (!this.keys[e.code]) this._justPressed[e.code] = true;
      this.keys[e.code] = true;
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
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
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (!this.pointerLocked) this.mouseDown = false;
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
    if (document.pointerLockElement !== this.domElement) {
      this.domElement.requestPointerLock();
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.domElement) {
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
