import * as THREE from 'three';
import { Character } from './Character.js';
import { MOVEMENT, TEAM, COLORS, PAINT } from '../config.js';

const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _horizVel = new THREE.Vector2();
const _fireOrigin = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _surfExitSplatPos = new THREE.Vector3();

// ============================================================================
// Player — human-controlled Character. Reads InputManager state and the
// CameraController's orientation to drive movement, jumping, ink-surf
// intent, and firing. All shared stat/collision/respawn logic lives in the
// base Character class.
// ============================================================================
export class Player extends Character {
  constructor(spawnPoint, cameraController, inputManager) {
    super(TEAM.PLAYER, spawnPoint);
    this.camera = cameraController;
    this.input = inputManager;
  }

  update(dt, ctx) {
    const { arena, paintSystem, projectileManager, particleManager, audioManager, controlsEnabled } = ctx;

    this.updateTimers(dt);
    if (!this.alive) {
      this.syncMesh(ctx.elapsedTime);
      return;
    }

    if (controlsEnabled) {
      this._handleMovement(dt, arena);
      this._handleFiring(dt, projectileManager, particleManager, audioManager);
    } else {
      // Still settle vertically so the player doesn't float during countdown/result.
      this.applyVerticalPhysics(dt, arena);
    }

    const wasInkSurfing = this.inkSurfActive;
    const wantsInkSurf = controlsEnabled && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    const speedMult = this.updateFloorEffects(dt, paintSystem, wantsInkSurf);
    this._lastSpeedMult = speedMult;

    if (controlsEnabled && wasInkSurfing && !this.inkSurfActive && !wantsInkSurf && this.grounded) {
      this.velocity.y = Math.max(this.velocity.y, MOVEMENT.inkSurfExitHopSpeed);
      this.grounded = false;
      audioManager.playInkSurfExit();
      _surfExitSplatPos.set(this.position.x, this.position.y + 0.08, this.position.z);
      particleManager.spawnSplat(_surfExitSplatPos, COLORS.player, true);
    }

    this.updateFloorParticles(dt, particleManager, paintSystem);

    this.yaw = this.camera.yaw;
    this.syncMesh(ctx.elapsedTime);
  }

  _handleMovement(dt, arena) {
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

    this.velocity.x = _horizVel.x;
    this.velocity.z = _horizVel.y;

    if (!this.isClimbing && input.wasJustPressed('Space')) {
      const panel = this._findClimbablePanel(arena);
      if (panel && input.isDown('KeyW') && this.ink > MOVEMENT.wallClimbInkCostPerSec * 0.2) {
        this._startClimb(panel);
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

  /** Finds a nearby wall panel the player is facing that already carries enough of their own ink to climb. */
  _findClimbablePanel(arena) {
    const r = MOVEMENT.capsuleRadius;
    for (const panel of arena.climbPanels) {
      const dist = panel.planeAxis === 'x'
        ? Math.abs(this.position.x - panel.planeValue)
        : Math.abs(this.position.z - panel.planeValue);
      if (dist > r + MOVEMENT.wallClimbApproachDist) continue;

      const tan = panel.planeAxis === 'x' ? this.position.z : this.position.x;
      if (tan < panel.tangentMin || tan > panel.tangentMax) continue;
      if (this.position.y >= panel.height - 0.05) continue;
      if (panel.paint.coverageFraction(this.team) < PAINT.wallOwnThreshold) continue;
      return panel;
    }
    return null;
  }

  _isTouchingPanel(panel) {
    const r = MOVEMENT.capsuleRadius;
    const dist = panel.planeAxis === 'x'
      ? Math.abs(this.position.x - panel.planeValue)
      : Math.abs(this.position.z - panel.planeValue);
    if (dist > r + MOVEMENT.wallClimbApproachDist + 0.3) return false;

    const tan = panel.planeAxis === 'x' ? this.position.z : this.position.x;
    return tan >= panel.tangentMin - 0.2 && tan <= panel.tangentMax + 0.2;
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

    const canContinue = panel && this.input.isDown('KeyW') && this._isTouchingPanel(panel)
      && this.ink > 0 && this._climbTimer > 0;

    if (!canContinue) {
      this._endClimb();
      this.velocity.y = Math.min(this.velocity.y, 0);
      return;
    }

    this.velocity.set(0, MOVEMENT.wallClimbSpeed, 0);
    this.position.y += MOVEMENT.wallClimbSpeed * dt;
    this.grounded = false;

    if (this.position.y >= panel.height) this._mountClimb(panel);
  }

  /** Pops the player up and inward onto the ledge once a climb reaches the panel's top. */
  _mountClimb(panel) {
    this.position.x += panel.normal.x * MOVEMENT.wallClimbMountInward;
    this.position.z += panel.normal.z * MOVEMENT.wallClimbMountInward;
    this.position.y = panel.height;
    this.velocity.set(panel.normal.x * 2.2, 3, panel.normal.z * 2.2);
    this.grounded = false;
    this._endClimb();
  }

  _endClimb() {
    this.isClimbing = false;
    this._climbPanel = null;
  }

  /** First-person view: the player never sees their own body (standard FPS convention). */
  syncMesh(elapsedTime) {
    super.syncMesh(elapsedTime);
    this.mesh.visible = false;
  }

  _handleFiring(dt, projectileManager, particleManager, audioManager) {
    this.weapon.update(dt);
    if (this.inkSurfActive || this.isClimbing) return;
    if (!this.input.mouseDown) return;

    this.camera.getAimDirection(_aimDir);
    _fireOrigin.copy(this.camera.camera.position).addScaledVector(_aimDir, 0.35);

    this.weapon.fire(this, _fireOrigin, _aimDir, projectileManager, audioManager, particleManager);
  }
}
