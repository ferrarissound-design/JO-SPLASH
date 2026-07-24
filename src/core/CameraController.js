import * as THREE from 'three';
import { CAMERA } from '../config.js';

const _look = new THREE.Vector3();
const _right = new THREE.Vector3();
const _anchor = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _arm = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _aimRayDirection = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _raycaster = new THREE.Raycaster();

// ============================================================================
// CameraController — third-person shoulder camera. Orbits behind the player,
// aims at a distant point along the requested yaw/pitch, and shortens its arm
// whenever arena geometry blocks the route from character to camera.
// ============================================================================
export class CameraController {
  constructor(camera, arena) {
    this.camera = camera;
    this.arena = arena;
    this.collisionMeshes = arena?.group?.children ?? [];

    this.yaw = Math.PI; // facing -Z by default (arbitrary initial heading)
    this.pitch = -0.05;
    this.currentDistance = CAMERA.shoulderDistance;
    this.cameraBlocked = false;
    this._initialized = false;
  }

  /** Apply raw mouse/touch movement deltas (pixels) to yaw/pitch. */
  applyLook(dx, dy) {
    this.yaw -= dx * CAMERA.sensitivity;
    this.pitch -= dy * CAMERA.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, CAMERA.minPitch, CAMERA.maxPitch);
  }

  /** Forward direction on the horizontal plane (yaw only) — used for player movement basis. */
  getFlatForward(out = new THREE.Vector3()) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  getFlatRight(out = new THREE.Vector3()) {
    out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out;
  }

  _getLookVector(out = new THREE.Vector3()) {
    const cosPitch = Math.cos(this.pitch);
    out.set(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    );
    return out.normalize();
  }

  /** Direction through the center crosshair from the current camera. */
  getAimDirection(out = new THREE.Vector3()) {
    this.camera.getWorldDirection(out);
    return out;
  }

  /** Character-relative right-shoulder muzzle position used by player weapons. */
  getFireOrigin(targetPosition, out = new THREE.Vector3()) {
    this.getFlatForward(_look);
    this.getFlatRight(_right);
    return out.copy(targetPosition)
      .addScaledVector(_worldUp, CAMERA.muzzleHeight)
      .addScaledVector(_right, CAMERA.muzzleShoulderOffset)
      .addScaledVector(_look, CAMERA.muzzleForwardOffset);
  }

  /** World point under the center crosshair, preferring the first arena surface hit. */
  getAimTarget(targetPosition, out = new THREE.Vector3()) {
    this._getLookVector(_look);
    out.copy(targetPosition)
      .addScaledVector(_worldUp, CAMERA.targetHeight)
      .addScaledVector(_look, CAMERA.aimDistance);

    if (this.collisionMeshes.length > 0) {
      _aimRayDirection.subVectors(out, this.camera.position).normalize();
      _raycaster.set(this.camera.position, _aimRayDirection);
      _raycaster.near = CAMERA.collisionNear;
      _raycaster.far = CAMERA.aimDistance + CAMERA.shoulderDistance;
      const hit = _raycaster.intersectObjects(this.collisionMeshes, true)[0];
      if (hit) out.copy(hit.point);
    }
    return out;
  }

  /** Shot direction from a shoulder muzzle toward the center-crosshair target. */
  getShotDirection(origin, targetPosition, out = new THREE.Vector3()) {
    this.getAimTarget(targetPosition, _aimPoint);
    return out.subVectors(_aimPoint, origin).normalize();
  }

  update(dt, targetPosition, sink = 0) {
    this._getLookVector(_look);
    this.getFlatRight(_right);

    const surfFactor = THREE.MathUtils.clamp(sink / Math.max(0.01, CAMERA.sinkReference), 0, 1);
    const distance = CAMERA.shoulderDistance - CAMERA.surfDistanceReduction * surfFactor;
    const shoulder = CAMERA.shoulderOffset
      * THREE.MathUtils.lerp(1, CAMERA.surfShoulderScale, surfFactor);

    _anchor.copy(targetPosition)
      .addScaledVector(_worldUp, CAMERA.targetHeight - sink * 0.48);
    _desired.copy(_anchor)
      .addScaledVector(_look, -distance)
      .addScaledVector(_right, shoulder)
      .addScaledVector(_worldUp, CAMERA.verticalOffset);

    _arm.subVectors(_desired, _anchor);
    const fullArmLength = _arm.length();
    _arm.normalize();
    let allowedArmLength = fullArmLength;
    this.cameraBlocked = false;

    if (this.collisionMeshes.length > 0) {
      _raycaster.set(_anchor, _arm);
      _raycaster.near = CAMERA.collisionNear;
      _raycaster.far = fullArmLength;
      const hit = _raycaster.intersectObjects(this.collisionMeshes, true)[0];
      if (hit) {
        allowedArmLength = Math.max(
          CAMERA.collisionNear,
          hit.distance - CAMERA.collisionPadding,
        );
        this.cameraBlocked = allowedArmLength < fullArmLength - 0.01;
      }
    }

    if (!this._initialized || allowedArmLength < this.currentDistance) {
      this.currentDistance = allowedArmLength;
    } else {
      const returnLerp = 1 - Math.exp(-CAMERA.returnSpeed * dt);
      this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, allowedArmLength, returnLerp);
    }
    this._initialized = true;

    this.camera.position.copy(_anchor).addScaledVector(_arm, this.currentDistance);
    _aimPoint.copy(_anchor).addScaledVector(_look, CAMERA.aimDistance);
    this.camera.lookAt(_aimPoint);
  }
}
