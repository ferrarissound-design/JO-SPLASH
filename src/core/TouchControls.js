import { TOUCH } from '../config.js';

// ============================================================================
// TouchControls — on-screen twin-stick-style controls for touch devices.
// Left half: a dynamic virtual joystick that appears wherever the thumb
// lands, mapped onto the same WASD virtual keys the keyboard uses. Right
// half: drag-anywhere-to-look, feeding InputManager's look-delta accumulator
// (the same one mouse movement uses). Fire/jump/ink-surf are dedicated
// buttons. Every effect goes through InputManager's public setters, so
// Player/CameraController/Game need no touch-specific branches.
//
// Each gesture is tracked by its Touch.identifier so the joystick and the
// look-drag can be driven by two fingers at once without interfering.
// ============================================================================
export class TouchControls {
  constructor(inputManager, container) {
    this.input = inputManager;
    this.container = container;

    this.el = {
      lookZone: container.querySelector('.touch-look-zone'),
      joystickZone: container.querySelector('.touch-joystick-zone'),
      joystickBase: container.querySelector('.touch-joystick-base'),
      joystickNub: container.querySelector('.touch-joystick-nub'),
      fireBtn: container.querySelector('.touch-btn-fire'),
      jumpBtn: container.querySelector('.touch-btn-jump'),
      surfBtn: container.querySelector('.touch-btn-surf'),
      specialBtn: container.querySelector('.touch-btn-special'),
      bombBtn: container.querySelector('.touch-btn-bomb'),
    };

    this._joystickTouchId = null;
    this._joystickCenter = { x: 0, y: 0 };
    this._lookTouchId = null;
    this._lookLast = { x: 0, y: 0 };

    this._onJoystickStart = this._onJoystickStart.bind(this);
    this._onJoystickMove = this._onJoystickMove.bind(this);
    this._onJoystickEnd = this._onJoystickEnd.bind(this);
    this._onLookStart = this._onLookStart.bind(this);
    this._onLookMove = this._onLookMove.bind(this);
    this._onLookEnd = this._onLookEnd.bind(this);

    this._bind();
  }

  _bind() {
    const jz = this.el.joystickZone;
    jz.addEventListener('touchstart', this._onJoystickStart, { passive: false });
    jz.addEventListener('touchmove', this._onJoystickMove, { passive: false });
    jz.addEventListener('touchend', this._onJoystickEnd, { passive: false });
    jz.addEventListener('touchcancel', this._onJoystickEnd, { passive: false });

    const lz = this.el.lookZone;
    lz.addEventListener('touchstart', this._onLookStart, { passive: false });
    lz.addEventListener('touchmove', this._onLookMove, { passive: false });
    lz.addEventListener('touchend', this._onLookEnd, { passive: false });
    lz.addEventListener('touchcancel', this._onLookEnd, { passive: false });

    this._bindButton(this.el.fireBtn, (held) => this.input.setFireHeld(held));
    this._bindButton(this.el.jumpBtn, (held) => this.input.setVirtualKey('Space', held));
    this._bindButton(this.el.surfBtn, (held) => this.input.setVirtualKey('ShiftLeft', held));
    this._bindButton(this.el.specialBtn, (held) => this.input.setVirtualKey('KeyQ', held));
    this._bindButton(this.el.bombBtn, (held) => this.input.setVirtualKey('KeyE', held));
  }

  _bindButton(el, cb) {
    const press = (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      cb(true);
      if (e.pointerId !== undefined && el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
    };
    const release = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
      cb(false);
      if (e.pointerId !== undefined && el.releasePointerCapture) {
        try { el.releasePointerCapture(e.pointerId); } catch {}
      }
    };

    if (window.PointerEvent) {
      el.addEventListener('pointerdown', press, { passive: false });
      el.addEventListener('pointerup', release, { passive: false });
      el.addEventListener('pointercancel', release, { passive: false });
      el.addEventListener('lostpointercapture', release, { passive: false });
    } else {
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
      el.addEventListener('touchcancel', release, { passive: false });
    }
  }

  _findTouch(touchList, id) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
  }

  // ------------------------------------------------------------- joystick
  _onJoystickStart(e) {
    e.preventDefault();
    if (this._joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    this._joystickTouchId = touch.identifier;
    this._joystickCenter.x = touch.clientX;
    this._joystickCenter.y = touch.clientY;

    const base = this.el.joystickBase;
    base.style.left = `${touch.clientX}px`;
    base.style.top = `${touch.clientY}px`;
    base.classList.add('active');
    this.el.joystickNub.classList.add('active');
    this._setNubOffset(0, 0);
  }

  _onJoystickMove(e) {
    const touch = this._findTouch(e.changedTouches, this._joystickTouchId);
    if (!touch) return;
    e.preventDefault();

    const dx = touch.clientX - this._joystickCenter.x;
    const dy = touch.clientY - this._joystickCenter.y;
    const rawDist = Math.hypot(dx, dy);
    const maxR = TOUCH.joystickMaxRadius;
    const dist = Math.min(rawDist, maxR);
    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * dist;
    const ny = Math.sin(angle) * dist;
    this._setNubOffset(nx, ny);

    const norm = dist / maxR;
    if (norm < TOUCH.joystickDeadzone || rawDist < 1) {
      this._setMoveKeys(0, 0);
      return;
    }
    this._setMoveKeys(nx / dist, ny / dist);
  }

  _onJoystickEnd(e) {
    const touch = this._findTouch(e.changedTouches, this._joystickTouchId);
    if (!touch) return;
    e.preventDefault();
    this._joystickTouchId = null;
    this.el.joystickBase.classList.remove('active');
    this.el.joystickNub.classList.remove('active');
    this._setMoveKeys(0, 0);
  }

  _setNubOffset(nx, ny) {
    this.el.joystickNub.style.left = `${this._joystickCenter.x + nx}px`;
    this.el.joystickNub.style.top = `${this._joystickCenter.y + ny}px`;
  }

  _setMoveKeys(dirX, dirY) {
    const THRESH = 0.35;
    this.input.setVirtualKey('KeyD', dirX > THRESH);
    this.input.setVirtualKey('KeyA', dirX < -THRESH);
    this.input.setVirtualKey('KeyS', dirY > THRESH);
    this.input.setVirtualKey('KeyW', dirY < -THRESH);
  }

  // ------------------------------------------------------------- look drag
  _onLookStart(e) {
    if (this._lookTouchId !== null) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    this._lookTouchId = touch.identifier;
    this._lookLast.x = touch.clientX;
    this._lookLast.y = touch.clientY;
  }

  _onLookMove(e) {
    const touch = this._findTouch(e.changedTouches, this._lookTouchId);
    if (!touch) return;
    e.preventDefault();
    const dx = touch.clientX - this._lookLast.x;
    const dy = touch.clientY - this._lookLast.y;
    this._lookLast.x = touch.clientX;
    this._lookLast.y = touch.clientY;
    this.input.addLookDelta(dx * TOUCH.lookSensitivityMult, dy * TOUCH.lookSensitivityMult);
  }

  _onLookEnd(e) {
    const touch = this._findTouch(e.changedTouches, this._lookTouchId);
    if (!touch) return;
    e.preventDefault();
    this._lookTouchId = null;
  }

  // ------------------------------------------------------------- lifecycle
  show() {
    this.container.classList.remove('hidden');
  }

  /** Hides the controls and releases any held virtual inputs so nothing stays "stuck" between rounds. */
  hide() {
    this.container.classList.add('hidden');
    this._joystickTouchId = null;
    this._lookTouchId = null;
    this.el.joystickBase.classList.remove('active');
    this.el.joystickNub.classList.remove('active');
    this._setMoveKeys(0, 0);
    this.input.setVirtualKey('Space', false);
    this.input.setVirtualKey('ShiftLeft', false);
    this.input.setVirtualKey('KeyQ', false);
    this.input.setVirtualKey('KeyE', false);
    this.input.setFireHeld(false);
    this.el.fireBtn.classList.remove('pressed');
    this.el.jumpBtn.classList.remove('pressed');
    this.el.surfBtn.classList.remove('pressed');
    this.el.specialBtn.classList.remove('pressed');
    this.el.bombBtn.classList.remove('pressed');
  }

  dispose() {
    const jz = this.el.joystickZone;
    jz.removeEventListener('touchstart', this._onJoystickStart);
    jz.removeEventListener('touchmove', this._onJoystickMove);
    jz.removeEventListener('touchend', this._onJoystickEnd);
    jz.removeEventListener('touchcancel', this._onJoystickEnd);

    const lz = this.el.lookZone;
    lz.removeEventListener('touchstart', this._onLookStart);
    lz.removeEventListener('touchmove', this._onLookMove);
    lz.removeEventListener('touchend', this._onLookEnd);
    lz.removeEventListener('touchcancel', this._onLookEnd);
  }
}
