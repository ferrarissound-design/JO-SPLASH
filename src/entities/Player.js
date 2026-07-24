import * as THREE from 'three';
import { Character } from './Character.js';
import { MOVEMENT, TEAM, COLORS, CAMERA } from '../config.js';
import { InkBurstSpecial } from '../systems/SpecialWeapon.js';
import { InkBomb } from '../systems/SubWeapon.js';
import { createPlayerCharacter } from './PlayerAppearance.js';

const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _horizVel = new THREE.Vector2();
const _fireOrigin = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _surfExitSplatPos = new THREE.Vector3();
const _inkRollFxPos = new THREE.Vector3();
const _wallRel = new THREE.Vector3();

// ============================================================================
// Player — human-controlled Character. Reads InputManager state and the
// CameraController's orientation to drive movement, jumping, ink-surf
// intent, and firing. All shared stat/collision/respawn logic lives in the
// base Character class.
// ============================================================================
export class Player extends Character {
  _createMesh() {
    return createPlayerCharacter();
  }

  constructor(spawnPoint, cameraController, inputManager) {
    super(TEAM.PLAYER, spawnPoint);
    this.camera = cameraController;
    this.input = inputManager;
    this.appearanceParts = this.mesh.userData.appearanceParts;
    this.special = new InkBurstSpecial(this.team);
    this.subWeapon = new InkBomb();
    this.isInkRolling = false;
    this.inkRollTimer = 0;
    this.inkRollCooldown = 0;
    this.inkRollArmorTimer = 0;
    this.inkRollsUsed = 0;
    this._fireWasHeld = false;
    this._debugClimbHold = false;
  }

  takeDamage(amount) {
    const multiplier = this.inkRollArmorTimer > 0 ? MOVEMENT.inkRollArmorMultiplier : 1;
    return super.takeDamage(amount * multiplier);
  }

  die() {
    super.die();
    this.special.active = false;
    this.special.timer = 0;
    this.special.charge *= 0.5;
    this.resetInkRoll();
    this.weapon.resetCharge();
    this._fireWasHeld = false;
    this._debugClimbHold = false;
  }

  respawn() {
    super.respawn();
    this.resetInkRoll();
    this.weapon.resetCharge();
    this._fireWasHeld = false;
    this._debugClimbHold = false;
  }

  update(dt, ctx) {
    const { arena, paintSystem, projectileManager, particleManager, audioManager, controlsEnabled } = ctx;

    this._updateInkRollTimers(dt);
    this.updateTimers(dt);
    if (!this.alive) {
      this.syncMesh(ctx.elapsedTime);
      return;
    }

    if (controlsEnabled) {
      this._handleMovement(dt, arena, particleManager, audioManager, ctx.ui);
    } else {
      // Still settle vertically so the player doesn't float during countdown/result.
      this.applyVerticalPhysics(dt, arena);
    }

    const wasInkSurfing = this.inkSurfActive;
    if (controlsEnabled && !this.isInkRolling && this.input.wasJustPressed('KeyQ')) {
      this.special.activate(this, audioManager, ctx.ui);
    }
    if (controlsEnabled) this._handleWeaponSelection(ctx.ui);

    const wantsInkSurf = controlsEnabled && !this.special.active && !this.isInkRolling
      && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    const speedMult = this.updateFloorEffects(dt, paintSystem, wantsInkSurf);
    this._lastSpeedMult = speedMult;
    this.updateHealthRegen(dt);
    if (controlsEnabled) {
      this.subWeapon.update(dt);
      this._handleSubWeapon(projectileManager, particleManager, audioManager);
      this._handleFiring(dt, projectileManager, particleManager, audioManager, ctx.ui);
    }

    if (controlsEnabled && wasInkSurfing && !this.inkSurfActive && !wantsInkSurf && this.grounded) {
      this.velocity.y = Math.max(this.velocity.y, MOVEMENT.inkSurfExitHopSpeed);
      this.grounded = false;
      audioManager.playInkSurfExit();
      _surfExitSplatPos.set(this.position.x, this.position.y + 0.08, this.position.z);
      particleManager.spawnSplat(_surfExitSplatPos, COLORS.player, true);
    }

    this.special.update(dt, this, {
      paintSystem,
      particleManager,
      opponent: ctx.cpu,
      onCharacterHit: ctx.onCharacterHit,
    });

    const trailPaintedCells = this.updateFloorParticles(dt, particleManager, paintSystem);
    this.special.addCharge(trailPaintedCells);

    this.yaw = this.camera.yaw;
    this.syncMesh(ctx.elapsedTime);
  }

  _handleMovement(dt, arena, particleManager, audioManager, ui) {
    const input = this.input;
    let ix = 0, iz = 0;
    if (input.isDown('KeyW')) iz -= 1;
    if (input.isDown('KeyS')) iz += 1;
    if (input.isDown('KeyA')) ix -= 1;
    if (input.isDown('KeyD')) ix += 1;

    this.camera.getFlatForward(_fwd);
    this.camera.getFlatRight(_right);

    _wish.set(0, 0, 0);
    if (ix !== 0 || iz !== 0) {
      _wish.addScaledVector(_fwd, -iz).addScaledVector(_right, ix).normalize();
    }

    const speedMult = this._lastSpeedMult ?? 1;
    const targetSpeed = MOVEMENT.walkSpeed * speedMult;
    const accel = this.grounded ? MOVEMENT.groundAcceleration : MOVEMENT.airAcceleration;

    _horizVel.set(this.velocity.x, this.velocity.z);
    const targetVel = { x: _wish.x * targetSpeed, z: _wish.z * targetSpeed };

    // Preserve the committed burst direction during the roll instead of
    // letting ordinary ground/air control immediately cancel it.
    if (!this.isInkRolling) {
      if (this.grounded) {
        if (_wish.lengthSq() < 1e-6) {
          // Friction to a stop when no input.
          const decel = Math.max(0, 1 - (MOVEMENT.friction * dt));
          _horizVel.multiplyScalar(decel);
        } else {
          _horizVel.x += (targetVel.x - _horizVel.x) * Math.min(1, accel * dt / Math.max(targetSpeed, 0.001));
          _horizVel.y += (targetVel.z - _horizVel.y) * Math.min(1, accel * dt / Math.max(targetSpeed, 0.001));
        }
      } else {
        // Limited air control: nudge velocity toward wish direction, can't fully redirect.
        _horizVel.x += (targetVel.x - _horizVel.x) * Math.min(1, MOVEMENT.airControl * accel * dt / Math.max(targetSpeed, 0.001));
        _horizVel.y += (targetVel.z - _horizVel.y) * Math.min(1, MOVEMENT.airControl * accel * dt / Math.max(targetSpeed, 0.001));
      }
    }

    this.velocity.x = _horizVel.x;
    this.velocity.z = _horizVel.y;

    if (!this.isClimbing && input.wasJustPressed('Space')) {
      const panel = this._findClimbablePanel(arena);
      if (panel && input.isDown('KeyW') && this.ink > MOVEMENT.wallClimbInkCostPerSec * 0.2) {
        this._startClimb(panel);
      } else if (this.inkSurfActive && this.grounded && this.inkRollCooldown <= 0 && _wish.lengthSq() > 0.1) {
        this._startInkRoll(_wish, particleManager, audioManager, ui);
      } else if (this.grounded) {
        this.inkSurfCooldown = MOVEMENT.inkSurfExitCooldownSec;
        this.inkSurfActive = false;
        this.velocity.y = MOVEMENT.jumpSpeed;
        this.grounded = false;
      }
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.resolveObstacleCollisions(arena);

    if (this.isClimbing) {
      this._updateClimbing(dt);
    } else {
      this.applyVerticalPhysics(dt, arena);
    }
  }

  _startInkRoll(direction, particleManager, audioManager, ui) {
    this.isInkRolling = true;
    this.inkRollTimer = MOVEMENT.inkRollDurationSec;
    this.inkRollArmorTimer = MOVEMENT.inkRollDurationSec;
    this.inkRollCooldown = MOVEMENT.inkRollCooldownSec;
    this.inkSurfCooldown = MOVEMENT.inkSurfExitCooldownSec;
    this.inkSurfActive = false;
    this.velocity.x = direction.x * MOVEMENT.inkRollSpeed;
    this.velocity.z = direction.z * MOVEMENT.inkRollSpeed;
    this.velocity.y = MOVEMENT.inkRollJumpSpeed;
    this.grounded = false;
    this.inkRollsUsed++;

    _inkRollFxPos.set(this.position.x, this.position.y + 0.12, this.position.z);
    particleManager?.spawnSplat(_inkRollFxPos, COLORS.player, true);
    audioManager?.playInkRoll();
    ui?.showStatusMessage('INK ROLL!', 0.55);
    return true;
  }

  debugStartInkRoll(particleManager, audioManager, ui) {
    if (!this.alive || !this.grounded || this.isClimbing || this.inkRollCooldown > 0) return false;
    this.camera.getFlatForward(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 0.01) _fwd.set(0, 0, -1);
    else _fwd.normalize();
    return this._startInkRoll(_fwd, particleManager, audioManager, ui);
  }

  debugFireChargedShot(projectileManager, particleManager, audioManager, ui) {
    if (!this.alive) return false;
    this.weapon.setType('precision');
    this.weapon.cooldown = 0;
    this.weapon.resetCharge();
    if (!this.weapon.beginCharge(this, audioManager)) return false;
    this.weapon.updateCharge(this.weapon.profile.charge.durationSec, this, audioManager);

    this._prepareShot();
    const fired = this.weapon.releaseCharge(
      this,
      _fireOrigin,
      _aimDir,
      projectileManager,
      audioManager,
      particleManager,
    );
    if (fired) ui?.showStatusMessage('FULL CHARGE SHOT!', 0.8);
    return fired;
  }

  debugStorePrecisionCharge(audioManager, ui) {
    if (!this.alive) return false;
    this.weapon.setType('precision');
    this.weapon.cooldown = 0;
    this.weapon.resetCharge();
    if (!this.weapon.beginCharge(this, audioManager)) return false;
    this.weapon.updateCharge(this.weapon.profile.charge.durationSec, this, audioManager);
    const stored = this.weapon.storeFullCharge(audioManager);
    if (stored) ui?.showStatusMessage('CHARGE KEPT!', 0.8);
    return stored;
  }

  _updateInkRollTimers(dt) {
    this.inkRollTimer = Math.max(0, this.inkRollTimer - dt);
    this.inkRollCooldown = Math.max(0, this.inkRollCooldown - dt);
    this.inkRollArmorTimer = Math.max(0, this.inkRollArmorTimer - dt);
    this.isInkRolling = this.inkRollTimer > 0;
  }

  resetInkRoll({ newMatch = false } = {}) {
    this.isInkRolling = false;
    this.inkRollTimer = 0;
    this.inkRollCooldown = 0;
    this.inkRollArmorTimer = 0;
    if (newMatch) this.inkRollsUsed = 0;
  }

  /** Finds a nearby wall panel the player is facing that already carries enough of their own ink to climb. */
  _findClimbablePanel(arena) {
    const r = MOVEMENT.capsuleRadius;
    for (const panel of arena.climbPanels) {
      _wallRel.subVectors(this.position, panel.paint.origin);
      const dist = Math.abs(_wallRel.dot(panel.normal));
      if (dist > r + MOVEMENT.wallClimbApproachDist) continue;

      const tangentPos = _wallRel.dot(panel.paint.tangent);
      if (tangentPos < -0.05 || tangentPos > panel.paint.width + 0.05) continue;
      if (this.position.y >= panel.topY - 0.05) continue;
      if (!panel.paint.hasVerticalPath(this.team, this.position)) continue;
      return panel;
    }
    return null;
  }

  _isTouchingPanel(panel) {
    const r = MOVEMENT.capsuleRadius;
    _wallRel.subVectors(this.position, panel.paint.origin);
    const dist = Math.abs(_wallRel.dot(panel.normal));
    if (dist > r + MOVEMENT.wallClimbApproachDist + 0.3) return false;

    const tangentPos = _wallRel.dot(panel.paint.tangent);
    return tangentPos >= -0.2 && tangentPos <= panel.paint.width + 0.2;
  }

  _startClimb(panel) {
    this.isClimbing = true;
    this._climbPanel = panel;
    this._climbTimer = MOVEMENT.wallClimbMaxDurationSec;
    this.velocity.set(0, MOVEMENT.wallClimbSpeed, 0);
    this.grounded = false;
  }

  /** Rides the climb: keeps rising while forward is held, ink lasts, and the panel is still in reach. */
  _updateClimbing(dt) {
    const panel = this._climbPanel;
    this._climbTimer -= dt;
    this.ink = Math.max(0, this.ink - MOVEMENT.wallClimbInkCostPerSec * dt);

    const canContinue = panel && (this.input.isDown('KeyW') || this._debugClimbHold)
      && this._isTouchingPanel(panel)
      && this.ink > 0 && this._climbTimer > 0;

    if (!canContinue) {
      this._endClimb();
      this.velocity.y = Math.min(this.velocity.y, 0);
      return;
    }

    this.velocity.set(0, MOVEMENT.wallClimbSpeed, 0);
    this.position.y += MOVEMENT.wallClimbSpeed * dt;
    this.grounded = false;

    if (this.position.y >= panel.topY) this._mountClimb(panel);
  }

  /** Pops the player up and inward onto the ledge once a climb reaches the panel's top. */
  _mountClimb(panel) {
    this.position.x += panel.normal.x * MOVEMENT.wallClimbMountInward;
    this.position.z += panel.normal.z * MOVEMENT.wallClimbMountInward;
    this.position.y = panel.topY;
    this.velocity.set(panel.normal.x * 2.2, 3, panel.normal.z * 2.2);
    this.grounded = false;
    this._endClimb();
  }

  _endClimb() {
    this.isClimbing = false;
    this._climbPanel = null;
    this._debugClimbHold = false;
  }

  /** Third-person view keeps the rig visible unless camera collision pushes inside it. */
  syncMesh(elapsedTime) {
    super.syncMesh(elapsedTime);
    if (this.camera.currentDistance < CAMERA.bodyHideDistance) this.mesh.visible = false;

    const parts = this.appearanceParts;
    if (!parts) return;
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const moveAmount = THREE.MathUtils.clamp(horizontalSpeed / MOVEMENT.walkSpeed, 0, 1.5);
    const stride = elapsedTime * (6.8 + moveAmount * 4.8);
    const surfScale = this.inkSurfActive ? 0.82 : 1;
    const gaitAmount = Math.min(1, moveAmount * 1.7);
    const runBlend = THREE.MathUtils.clamp((moveAmount - 0.35) / 0.75, 0, 1);
    const gaitPhase = Math.sin(stride);
    const gaitRise = Math.abs(Math.sin(stride * 2));
    const strideSwing = gaitPhase * THREE.MathUtils.lerp(0.42, 1.02, runBlend) * gaitAmount;

    parts.motionRoot.position.y = gaitRise * THREE.MathUtils.lerp(0.025, 0.07, runBlend) * gaitAmount;
    parts.motionRoot.rotation.z = gaitPhase * THREE.MathUtils.lerp(0.035, 0.075, runBlend) * gaitAmount;
    parts.motionRoot.scale.set(1, surfScale, 1);
    parts.hairGroup.rotation.z = Math.sin(stride - 0.8) * 0.055 * moveAmount;
    parts.hairGroup.rotation.x = -0.05 - Math.min(0.16, moveAmount * 0.09);
    parts.shooter.rotation.x = Math.sin(stride * 2 + 0.7) * 0.025 * moveAmount;
    parts.tank.rotation.z = -Math.sin(stride) * 0.02 * moveAmount;

    // Reset joint-local offsets first so every special pose cleanly returns to
    // the same neutral stance without accumulating animation transforms.
    parts.legLPivot.position.set(-0.16, 0.7, 0);
    parts.legRPivot.position.set(0.16, 0.7, 0);
    parts.legLPivot.rotation.z = 0;
    parts.legRPivot.rotation.z = 0;
    parts.armLPivot.rotation.z = 0;
    parts.armRPivot.rotation.z = 0;
    parts.shoeL.rotation.x = 0;
    parts.shoeR.rotation.x = 0;

    if (this.isClimbing) {
      const climbSwing = Math.sin(elapsedTime * 9) * 0.48;
      parts.legLPivot.rotation.x = climbSwing;
      parts.legRPivot.rotation.x = -climbSwing;
      parts.armLPivot.rotation.x = -climbSwing;
      parts.armRPivot.rotation.x = climbSwing * 0.65;
    } else if (this.inkSurfActive) {
      parts.legLPivot.rotation.x = 0.52;
      parts.legRPivot.rotation.x = 0.52;
      parts.armLPivot.rotation.x = -0.18;
      parts.armRPivot.rotation.x = -0.08;
    } else if (!this.grounded) {
      parts.legLPivot.rotation.x = -0.3;
      parts.legRPivot.rotation.x = 0.18;
      parts.armLPivot.rotation.x = 0.24;
      parts.armRPivot.rotation.x = -0.12;
    } else {
      const liftHeight = THREE.MathUtils.lerp(0.055, 0.17, runBlend) * gaitAmount;
      const leftLift = Math.max(0, gaitPhase) * liftHeight;
      const rightLift = Math.max(0, -gaitPhase) * liftHeight;
      const outward = Math.abs(gaitPhase) * THREE.MathUtils.lerp(0.018, 0.055, runBlend) * gaitAmount;
      const legSplay = THREE.MathUtils.lerp(0.035, 0.105, runBlend) * gaitAmount;
      const toeKick = THREE.MathUtils.lerp(0.12, 0.38, runBlend) * gaitAmount;

      parts.legLPivot.position.x -= outward;
      parts.legRPivot.position.x += outward;
      parts.legLPivot.position.y += leftLift;
      parts.legRPivot.position.y += rightLift;
      parts.legLPivot.rotation.x = strideSwing;
      parts.legRPivot.rotation.x = -strideSwing;
      parts.legLPivot.rotation.z = -legSplay * Math.abs(gaitPhase);
      parts.legRPivot.rotation.z = legSplay * Math.abs(gaitPhase);
      parts.shoeL.rotation.x = -Math.max(0, gaitPhase) * toeKick;
      parts.shoeR.rotation.x = -Math.max(0, -gaitPhase) * toeKick;
      parts.armLPivot.rotation.x = -strideSwing * 0.62;
      parts.armRPivot.rotation.x = strideSwing * 0.38;
      parts.armLPivot.rotation.z = -0.055 * gaitAmount;
      parts.armRPivot.rotation.z = 0.035 * gaitAmount;
    }
  }

  /** Player uses shared cached body geometry plus a small owned detail set. */
  dispose() {
    for (const geometry of this.mesh.userData.ownedGeometries ?? []) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  _prepareShot() {
    this.camera.getFireOrigin(this.position, _fireOrigin);
    this.camera.getShotDirection(_fireOrigin, this.position, _aimDir);
  }

  _handleFiring(dt, projectileManager, particleManager, audioManager, ui) {
    this.weapon.update(dt);
    const fireHeld = this.input.mouseDown;

    if (this.inkSurfActive) {
      if (this.weapon.usesCharge && this.weapon.chargeReady && this.weapon.charging) {
        if (this.weapon.storeFullCharge(audioManager)) ui?.showStatusMessage('CHARGE KEPT!', 0.65);
      } else if (!this.weapon.chargeStored) {
        this.weapon.resetCharge();
      }
      if (this.weapon.chargeStored) {
        const wasStored = this.weapon.chargeStored;
        this.weapon.updateStoredCharge(dt, audioManager);
        if (wasStored && !this.weapon.chargeStored) ui?.showStatusMessage('CHARGE LOST', 0.65);
      }
      this._fireWasHeld = fireHeld;
      return;
    }

    if (this.isClimbing || this.isInkRolling || this.special.active) {
      this.weapon.resetCharge();
      this._fireWasHeld = fireHeld;
      return;
    }

    if (this.weapon.usesCharge) {
      if (this.weapon.chargeStored) {
        const wasStored = this.weapon.chargeStored;
        const stillStored = this.weapon.updateStoredCharge(dt, audioManager);
        if (!stillStored) {
          if (wasStored) ui?.showStatusMessage('CHARGE LOST', 0.65);
        } else if (fireHeld && this.weapon.restoreStoredCharge(audioManager)) {
          ui?.showStatusMessage('CHARGE READY!', 0.55);
        } else {
          this._fireWasHeld = fireHeld;
          return;
        }
      }

      if (fireHeld) {
        if (!this.weapon.charging) this.weapon.beginCharge(this, audioManager);
        this.weapon.updateCharge(dt, this, audioManager);
      } else if (this._fireWasHeld && this.weapon.charging) {
        this._prepareShot();
        this.weapon.releaseCharge(
          this,
          _fireOrigin,
          _aimDir,
          projectileManager,
          audioManager,
          particleManager,
        );
      }
      this._fireWasHeld = fireHeld;
      return;
    }

    this.weapon.resetCharge();
    this._fireWasHeld = fireHeld;
    if (!fireHeld) return;

    this._prepareShot();

    this.weapon.fire(this, _fireOrigin, _aimDir, projectileManager, audioManager, particleManager);
  }

  _handleWeaponSelection(ui) {
    const choices = [
      ['Digit1', 'stream'],
      ['Digit2', 'spread'],
      ['Digit3', 'precision'],
    ];
    for (const [key, type] of choices) {
      if (this.input.wasJustPressed(key) && this.weapon.setType(type)) {
        ui?.showStatusMessage(`MAIN: ${this.weapon.displayName}`, 1);
      }
    }
  }

  _handleSubWeapon(projectileManager, particleManager, audioManager) {
    if (!this.input.wasJustPressed('KeyE') || this.special.active || this.isInkRolling) return;
    this._prepareShot();
    this.subWeapon.fire(this, _fireOrigin, _aimDir, projectileManager, audioManager, particleManager);
  }
}
