import * as THREE from 'three';
import { COLORS, INK, SPECIAL, TEAM } from '../config.js';

const _point = new THREE.Vector3();
const _forward = new THREE.Vector3();

// ============================================================================
// Special — a team's selectable ultimate ability. Productive painting charges
// it; activation refills ink and runs the selected type's payoff. One
// instance lives per Character and is reused for the whole match — switching
// type (setType) just changes which payoff future activations run, mirroring
// InkBomb's single-instance-with-setType pattern in SubWeapon.js.
//
// Types (see SPECIAL.profiles in config.js for tunable numbers):
//   burst  - expanding paint pulses from the character's own position.
//   rain   - repeated paint pulses at a point locked in ahead of the
//            character at activation time.
//   shield - damage reduction + steady paint under the character's feet,
//            no opponent damage.
// ============================================================================
export class Special {
  constructor(team, type = SPECIAL.defaultType) {
    this.team = team;
    this.charge = 0;
    this.active = false;
    this.timer = 0;
    this.type = SPECIAL.profiles[type] ? type : SPECIAL.defaultType;
    this._pulseIndex = 0;
    this._hitOpponent = false;
    this._tickTimer = 0;
    this._targetPoint = new THREE.Vector3();
  }

  get profile() {
    return SPECIAL.profiles[this.type];
  }

  get displayName() {
    return this.profile.name;
  }

  get ready() {
    return this.charge >= SPECIAL.maxCharge;
  }

  /** Multiplier applied to incoming damage while active; only shield deviates from 1. */
  get damageMultiplier() {
    if (this.active && this.type === 'shield') {
      return Math.max(0, 1 - this.profile.damageReduction);
    }
    return 1;
  }

  setType(type) {
    if (!SPECIAL.profiles[type] || type === this.type || this.active) return false;
    this.type = type;
    return true;
  }

  addCharge(paintedCells) {
    if (this.active || paintedCells <= 0) return;
    this.charge = Math.min(
      SPECIAL.maxCharge,
      this.charge + paintedCells / SPECIAL.cellsPerCharge
    );
  }

  activate(character, audioManager, ui) {
    if (!this.ready || this.active || !character.alive || character.inkSurfActive) return false;
    this.charge = 0;
    this.active = true;
    this.timer = this.profile.durationSec;
    this._pulseIndex = 0;
    this._hitOpponent = false;
    this._tickTimer = 0;
    if (this.type === 'rain') {
      _forward.set(-Math.sin(character.yaw), 0, -Math.cos(character.yaw));
      this._targetPoint.copy(character.position).addScaledVector(_forward, this.profile.forwardDistance);
    }
    character.ink = INK.max;
    audioManager?.playSpecial();
    ui?.showStatusMessage(`${this.profile.nameJa}！`, 1.2);
    return true;
  }

  update(dt, character, ctx) {
    if (!this.active) return;

    this.timer = Math.max(0, this.timer - dt);
    if (this.type === 'rain') this._updateRain(character, ctx);
    else if (this.type === 'shield') this._updateShield(dt, character, ctx);
    else this._updateBurst(character, ctx);

    if (this.timer <= 0) this.active = false;
  }

  _updateBurst(character, ctx) {
    const profile = this.profile;
    const elapsed = profile.durationSec - this.timer;
    const targetPulse = Math.floor(elapsed / profile.pulseIntervalSec);
    const pulseCount = Math.ceil(profile.durationSec / profile.pulseIntervalSec);

    while (this._pulseIndex <= targetPulse && this._pulseIndex < pulseCount) {
      const t = pulseCount <= 1 ? 1 : this._pulseIndex / (pulseCount - 1);
      const radius = THREE.MathUtils.lerp(profile.minRadius, profile.maxRadius, t);
      ctx.paintSystem.paintSplat(character.position.x, character.position.z, radius, this.team, {
        splatterScale: 0.7 + t * 0.8,
        glossScale: 0.8 + t * 0.5,
      });

      const color = this.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
      _point.set(character.position.x, character.position.y + 0.18, character.position.z);
      ctx.particleManager.spawnSplat(_point, color, true);

      const opponent = ctx.opponent;
      if (!this._hitOpponent && opponent?.alive && opponent.position.distanceTo(character.position) <= radius) {
        this._hitOpponent = true;
        ctx.onCharacterHit?.(opponent.team, profile.damage, opponent.position.clone());
      }
      this._pulseIndex++;
    }
  }

  _updateRain(character, ctx) {
    const profile = this.profile;
    const elapsed = profile.durationSec - this.timer;
    const targetPulse = Math.floor(elapsed / profile.pulseIntervalSec);
    const pulseCount = Math.ceil(profile.durationSec / profile.pulseIntervalSec);

    while (this._pulseIndex <= targetPulse && this._pulseIndex < pulseCount) {
      ctx.paintSystem.paintSplat(this._targetPoint.x, this._targetPoint.z, profile.radius, this.team, {
        splatterScale: 0.85,
        glossScale: 0.9,
      });

      const color = this.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
      _point.set(this._targetPoint.x, this._targetPoint.y + 0.2, this._targetPoint.z);
      ctx.particleManager.spawnSplat(_point, color, true);

      const opponent = ctx.opponent;
      if (opponent?.alive) {
        const dx = opponent.position.x - this._targetPoint.x;
        const dz = opponent.position.z - this._targetPoint.z;
        if (dx * dx + dz * dz <= profile.radius * profile.radius) {
          ctx.onCharacterHit?.(opponent.team, profile.damagePerPulse, opponent.position.clone());
        }
      }
      this._pulseIndex++;
    }
  }

  _updateShield(dt, character, ctx) {
    const profile = this.profile;
    this._tickTimer -= dt;
    if (this._tickTimer > 0) return;
    this._tickTimer = profile.tickIntervalSec;

    ctx.paintSystem.paintSplat(character.position.x, character.position.z, profile.tickRadius, this.team, {
      splatterScale: 0.55,
      glossScale: 0.65,
    });
    const color = this.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
    _point.set(character.position.x, character.position.y + 0.15, character.position.z);
    ctx.particleManager.spawnSplat(_point, color, false);
  }

  reset() {
    this.charge = 0;
    this.active = false;
    this.timer = 0;
    this._pulseIndex = 0;
    this._hitOpponent = false;
    this._tickTimer = 0;
  }
}
