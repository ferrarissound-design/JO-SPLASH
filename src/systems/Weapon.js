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
    this.charge = 0;
    this.charging = false;
    this.chargeReady = false;
    this.chargeStored = false;
    this.chargeStoreTimer = 0;
  }

  get profile() {
    return WEAPON.profiles[this.type];
  }

  get displayName() {
    return this.profile.name;
  }

  get usesCharge() {
    return Boolean(this.profile.charge);
  }

  get chargeStoreDuration() {
    return this.profile.charge?.storeDurationSec ?? 0;
  }

  setType(type) {
    if (!WEAPON.profiles[type] || type === this.type) return false;
    this.resetCharge();
    this.type = type;
    this.cooldown = Math.min(this.cooldown, this.profile.fireInterval);
    return true;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.recoilTimer > 0) this.recoilTimer = Math.max(0, this.recoilTimer - dt * 4);
  }

  canFire(character, profile = this.profile) {
    return character.alive
      && !character.inkSurfActive
      && !character.isClimbing
      && this.cooldown <= 0
      && character.ink >= profile.costPerShot;
  }

  beginCharge(character, audioManager) {
    const charge = this.profile.charge;
    if (!charge || this.charging || this.chargeStored) return false;
    const minimumProfile = { ...this.profile, costPerShot: charge.minInkCost };
    if (!this.canFire(character, minimumProfile)) return false;

    this.charge = 0;
    this.charging = true;
    this.chargeReady = false;
    audioManager?.playChargeStart();
    return true;
  }

  updateCharge(dt, character, audioManager) {
    const charge = this.profile.charge;
    if (!charge || !this.charging || this.chargeStored) return false;
    if (!character.alive || character.inkSurfActive || character.isClimbing || character.ink < charge.minInkCost) {
      this.resetCharge();
      return false;
    }

    const wasReady = this.chargeReady;
    const affordableRatio = THREE.MathUtils.clamp(
      (character.ink - charge.minInkCost) / (charge.fullInkCost - charge.minInkCost),
      0,
      1,
    );
    this.charge = Math.min(1, affordableRatio, this.charge + dt / charge.durationSec);
    this.chargeReady = this.charge >= 1;
    if (this.chargeReady && !wasReady) audioManager?.playChargeReady();
    return true;
  }

  storeFullCharge(audioManager) {
    const duration = this.chargeStoreDuration;
    if (!this.usesCharge || !this.charging || !this.chargeReady || this.charge < 1 || duration <= 0) {
      return false;
    }

    this.charging = false;
    this.chargeStored = true;
    this.chargeStoreTimer = duration;
    audioManager?.playChargeStore();
    return true;
  }

  updateStoredCharge(dt, audioManager) {
    if (!this.chargeStored) return false;
    this.chargeStoreTimer = Math.max(0, this.chargeStoreTimer - dt);
    if (this.chargeStoreTimer > 0) return true;
    this.resetCharge();
    audioManager?.playChargeLost();
    return false;
  }

  restoreStoredCharge(audioManager) {
    if (!this.chargeStored || this.chargeStoreTimer <= 0) return false;
    this.chargeStored = false;
    this.chargeStoreTimer = 0;
    this.charge = 1;
    this.charging = true;
    this.chargeReady = true;
    audioManager?.playChargeRestore();
    return true;
  }

  releaseCharge(character, origin, direction, projectileManager, audioManager, particleManager) {
    if (!this.profile.charge || !this.charging) return false;
    const ratio = THREE.MathUtils.clamp(this.charge, 0, 1);
    const shotProfile = this._buildChargedProfile(ratio);
    this.resetCharge();
    return this._fireProfile(
      character,
      origin,
      direction,
      projectileManager,
      audioManager,
      particleManager,
      shotProfile,
      true,
    );
  }

  resetCharge() {
    this.charge = 0;
    this.charging = false;
    this.chargeReady = false;
    this.chargeStored = false;
    this.chargeStoreTimer = 0;
  }

  /** Attempts to fire; returns true if a shot was produced. */
  fire(character, origin, direction, projectileManager, audioManager, particleManager) {
    return this._fireProfile(
      character,
      origin,
      direction,
      projectileManager,
      audioManager,
      particleManager,
      this.profile,
      false,
    );
  }

  _fireProfile(character, origin, direction, projectileManager, audioManager, particleManager, profile, chargedShot) {
    if (!this.canFire(character, profile)) return false;

    _dir.copy(direction).normalize();
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
    if (chargedShot) audioManager?.playChargeShot(profile.chargeRatio);
    else audioManager?.playShoot();

    return true;
  }

  _buildChargedProfile(ratio) {
    const base = this.profile;
    const charge = base.charge;
    const eased = ratio * ratio * (3 - 2 * ratio);
    const lerp = THREE.MathUtils.lerp;
    return {
      ...base,
      costPerShot: lerp(charge.minInkCost, charge.fullInkCost, ratio),
      projectileSpeed: lerp(charge.minProjectileSpeed, charge.fullProjectileSpeed, eased),
      projectileRadius: lerp(charge.minProjectileRadius, charge.fullProjectileRadius, eased),
      maxRange: lerp(charge.minRange, charge.fullRange, eased),
      damage: lerp(charge.minDamage, charge.fullDamage, eased),
      spreadRad: lerp(charge.minSpreadRad, charge.fullSpreadRad, eased),
      paintRadius: lerp(charge.minPaintRadius, charge.fullPaintRadius, eased),
      paintLineRadius: lerp(charge.minLineRadius, charge.fullLineRadius, eased),
      paintLineSpacing: lerp(charge.minLineSpacing, charge.fullLineSpacing, eased),
      paintLineDrop: lerp(charge.minLineDrop, charge.fullLineDrop, eased),
      wallPaintLength: lerp(charge.minWallLineLength, charge.fullWallLineLength, eased),
      fireInterval: lerp(charge.minFireInterval, charge.fullFireInterval, eased),
      chargeRatio: ratio,
    };
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
