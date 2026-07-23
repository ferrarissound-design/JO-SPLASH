import * as THREE from 'three';
import { Character } from './Character.js';
import { MOVEMENT, TEAM } from '../config.js';

const _wish = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _horizVel = new THREE.Vector2();
const _fireOrigin = new THREE.Vector3();
const _aimDir = new THREE.Vector3();

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

    const wantsInkSurf = controlsEnabled && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    const speedMult = this.updateFloorEffects(dt, paintSystem, wantsInkSurf);
    this._lastSpeedMult = speedMult;
    this.updateFloorParticles(dt, particleManager);

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

    if (this.grounded && input.wasJustPressed('Space')) {
      this.inkSurfCooldown = MOVEMENT.inkSurfExitCooldownSec;
      this.inkSurfActive = false;
      this.velocity.y = MOVEMENT.jumpSpeed;
      this.grounded = false;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.resolveObstacleCollisions(arena);
    this.applyVerticalPhysics(dt, arena);
  }

  /** First-person view: the player never sees their own body (standard FPS convention). */
  syncMesh(elapsedTime) {
    super.syncMesh(elapsedTime);
    this.mesh.visible = false;
  }

  _handleFiring(dt, projectileManager, particleManager, audioManager) {
    this.weapon.update(dt);
    if (this.inkSurfActive) return;
    if (!this.input.mouseDown) return;

    this.camera.getAimDirection(_aimDir);
    _fireOrigin.copy(this.camera.camera.position).addScaledVector(_aimDir, 0.35);

    this.weapon.fire(this, _fireOrigin, _aimDir, projectileManager, audioManager, particleManager);
  }
}
