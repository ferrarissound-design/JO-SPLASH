import * as THREE from 'three';
import { CAMERA } from '../config.js';

// ============================================================================
// CameraController — first-person camera. Sits exactly at the player's eye
// position and rotates with yaw/pitch from mouse/touch look input. Because
// the camera never leaves the (already collision-resolved) character
// position, there is no separate camera-vs-world collision to solve, and the
// character's own body never blocks the view.
// ============================================================================
export class CameraController {
  constructor(camera) {
    this.camera = camera;

    this.yaw = Math.PI; // facing -Z by default (arbitrary initial heading)
    this.pitch = -0.05;
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

  /** Full look direction including pitch — used as the weapon's aim direction. */
  getAimDirection(out = new THREE.Vector3()) {
    this.camera.getWorldDirection(out);
    return out;
  }

  update(dt, targetPosition, sink = 0) {
    this.camera.position.set(targetPosition.x, targetPosition.y + CAMERA.eyeHeight - sink, targetPosition.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
