import * as THREE from 'three';
import { CAMERA } from '../config.js';

const _pivot = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();

// ============================================================================
// CameraController — third-person shoulder camera. Orbits a pivot above the
// player using yaw/pitch driven by mouse deltas, offset slightly to the
// right shoulder, and pulled inward via raycast when geometry would
// otherwise clip between the pivot and the ideal camera position.
// ============================================================================
export class CameraController {
  constructor(camera, collidableMeshes) {
    this.camera = camera;
    this.collidableMeshes = collidableMeshes;

    this.yaw = Math.PI; // facing -Z by default (arbitrary initial heading)
    this.pitch = -0.15;

    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = CAMERA.distance + 2;

    this._currentDistance = CAMERA.distance;
  }

  /** Apply raw mouse movement deltas (pixels) to yaw/pitch. */
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

  /** Full look direction including pitch — used as the weapon's aim direction. */
  getAimDirection(out = new THREE.Vector3()) {
    this.camera.getWorldDirection(out);
    return out;
  }

  update(dt, targetPosition) {
    _pivot.set(targetPosition.x, targetPosition.y + CAMERA.lookHeight, targetPosition.z);

    // _dir points from the pivot OUT to the camera (i.e. "backward+up"), so its
    // vertical component is the negated pitch: positive pitch (looking up)
    // must pull the camera down/behind, not push it further above the pivot.
    _dir.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.getFlatRight(_right);

    _desired.copy(_pivot)
      .addScaledVector(_dir, CAMERA.distance)
      .addScaledVector(_right, CAMERA.shoulderOffset);
    _desired.y = Math.max(_desired.y, targetPosition.y + 0.4);

    let targetDistance = CAMERA.distance;

    if (this.collidableMeshes && this.collidableMeshes.length) {
      _rayOrigin.copy(_pivot);
      const toDesired = _desired.clone().sub(_rayOrigin);
      const fullDist = toDesired.length();
      if (fullDist > 0.001) {
        toDesired.normalize();
        this._raycaster.set(_rayOrigin, toDesired);
        this._raycaster.far = fullDist;
        const hits = this._raycaster.intersectObjects(this.collidableMeshes, false);
        if (hits.length > 0) {
          targetDistance = Math.max(0.6, hits[0].distance - CAMERA.collisionPadding);
        } else {
          targetDistance = fullDist;
        }
      }
    }

    // Smooth the pull-in/out so camera collision resolution doesn't pop.
    const lerpFactor = 1 - Math.exp(-CAMERA.followLerp * dt);
    this._currentDistance += (targetDistance - this._currentDistance) * lerpFactor;

    const finalPos = _pivot.clone()
      .addScaledVector(_dir, this._currentDistance)
      .addScaledVector(_right, CAMERA.shoulderOffset * Math.min(1, this._currentDistance / CAMERA.distance));

    this.camera.position.copy(finalPos);
    this.camera.lookAt(_pivot);
  }
}
