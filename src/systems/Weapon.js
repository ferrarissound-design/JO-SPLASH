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
  constructor(type = WEAPON.defaultType) {
    this.cooldown = 0;
    this.recoilTimer = 0;
    this.type = WEAPON.profiles[type] ? type : WEAPON.defaultType;
  }

  get profile() {
    return WEAPON.profiles[this.type];
  }

  get displayName() {
    return this.profile.name;
  }

  setType(type) {
    if (!WEAPON.profiles[type] || type === this.type) return false;
    this.type = type;
    this.cooldown = Math.min(this.cooldown, this.profile.fireInterval);
    return true;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.recoilTimer > 0) this.recoilTimer = Math.max(0, this.recoilTimer - dt * 4);
  }

  canFire(character) {
    return character.alive
      && !character.inkSurfActive
      && !character.isClimbing
      && this.cooldown <= 0
      && character.ink >= this.profile.costPerShot;
  }

  /** Attempts to fire; returns true if a shot was produced. */
  fire(character, origin, direction, projectileManager, audioManager, particleManager) {
    if (!this.canFire(character)) return false;

    _dir.copy(direction).normalize();
    const profile = this.profile;
    let spawned = 0;
    for (let i = 0; i < profile.pelletCount; i++) {
      const spreadDir = this._applySpread(_dir, profile.spreadRad);
      if (projectileManager.spawn(origin, spreadDir, character.team, profile)) spawned++;
    }
    if (spawned === 0) return false;

    character.ink -= profile.costPerShot;
    this.cooldown = profile.fireInterval;
    this.recoilTimer = 1;

    const color = character.team === TEAM.PLAYER ? 0x2fb8ff : 0xff7a2f;
    particleManager?.spawnMuzzle(origin, color);
    audioManager?.playShoot();

    return true;
  }

  _applySpread(dir, spread) {
    const useAlt = Math.abs(dir.y) > 0.98;
    _right.crossVectors(dir, useAlt ? _altUp : _worldUp).normalize();
    _up.crossVectors(_right, dir).normalize();

    const a = (Math.random() - 0.5) * 2 * spread;
    const b = (Math.random() - 0.5) * 2 * spread;

    return dir.clone().addScaledVector(_right, a).addScaledVector(_up, b).normalize();
  }
}
