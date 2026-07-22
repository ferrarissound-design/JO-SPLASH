import * as THREE from 'three';
import { WEAPON, TEAM } from '../config.js';

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _altUp = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();

// ============================================================================
// Weapon — the single starter ink-shooter's firing logic: cooldown gating,
// ink cost, light directional spread. One instance lives per Character.
// Actual projectile creation is delegated to ProjectileManager so pooling
// stays centralized.
// ============================================================================
export class Weapon {
  constructor() {
    this.cooldown = 0;
    this.recoilTimer = 0;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.recoilTimer > 0) this.recoilTimer = Math.max(0, this.recoilTimer - dt * 4);
  }

  canFire(character) {
    return character.alive && this.cooldown <= 0 && character.ink >= WEAPON.costPerShot;
  }

  /** Attempts to fire; returns true if a shot was produced. */
  fire(character, origin, direction, projectileManager, audioManager, particleManager) {
    if (!this.canFire(character)) return false;

    character.ink -= WEAPON.costPerShot;
    this.cooldown = WEAPON.fireInterval;
    this.recoilTimer = 1;

    _dir.copy(direction).normalize();
    const spreadDir = this._applySpread(_dir);

    projectileManager.spawn(origin, spreadDir, character.team);

    const color = character.team === TEAM.PLAYER ? 0x2fb8ff : 0xff7a2f;
    particleManager?.spawnMuzzle(origin, color);
    audioManager?.playShoot();

    return true;
  }

  _applySpread(dir) {
    const useAlt = Math.abs(dir.y) > 0.98;
    _right.crossVectors(dir, useAlt ? _altUp : _worldUp).normalize();
    _up.crossVectors(_right, dir).normalize();

    const spread = WEAPON.spreadRad;
    const a = (Math.random() - 0.5) * 2 * spread;
    const b = (Math.random() - 0.5) * 2 * spread;

    return dir.clone().addScaledVector(_right, a).addScaledVector(_up, b).normalize();
  }
}
