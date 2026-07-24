import * as THREE from 'three';
import { COLORS, INK, SPECIAL, TEAM } from '../config.js';

const _burstPoint = new THREE.Vector3();

// ============================================================================
// InkBurstSpecial — a territory-first comeback tool. Productive painting
// charges it; activation refills ink and sends expanding paint pulses from the
// character. The special's own paint never recharges itself.
// ============================================================================
export class InkBurstSpecial {
  constructor(team) {
    this.team = team;
    this.charge = 0;
    this.active = false;
    this.timer = 0;
    this._pulseIndex = 0;
    this._hitOpponent = false;
  }

  get ready() {
    return this.charge >= SPECIAL.maxCharge;
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
    this.timer = SPECIAL.durationSec;
    this._pulseIndex = 0;
    this._hitOpponent = false;
    character.ink = INK.max;
    audioManager?.playSpecial();
    ui?.showStatusMessage('INK BURST!', 1.2);
    return true;
  }

  update(dt, character, ctx) {
    if (!this.active) return;

    this.timer = Math.max(0, this.timer - dt);
    const elapsed = SPECIAL.durationSec - this.timer;
    const targetPulse = Math.floor(elapsed / SPECIAL.pulseIntervalSec);
    const pulseCount = Math.ceil(SPECIAL.durationSec / SPECIAL.pulseIntervalSec);

    while (this._pulseIndex <= targetPulse && this._pulseIndex < pulseCount) {
      const t = pulseCount <= 1 ? 1 : this._pulseIndex / (pulseCount - 1);
      const radius = THREE.MathUtils.lerp(SPECIAL.minRadius, SPECIAL.maxRadius, t);
      ctx.paintSystem.paintSplat(character.position.x, character.position.z, radius, this.team, {
        splatterScale: 0.7 + t * 0.8,
        glossScale: 0.8 + t * 0.5,
      });

      const color = this.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
      _burstPoint.set(character.position.x, character.position.y + 0.18, character.position.z);
      ctx.particleManager.spawnSplat(_burstPoint, color, true);

      const opponent = ctx.opponent;
      if (!this._hitOpponent && opponent?.alive && opponent.position.distanceTo(character.position) <= radius) {
        this._hitOpponent = true;
        ctx.onCharacterHit?.(opponent.team, SPECIAL.damage, opponent.position.clone());
      }
      this._pulseIndex++;
    }

    if (this.timer <= 0) this.active = false;
  }

  reset() {
    this.charge = 0;
    this.active = false;
    this.timer = 0;
    this._pulseIndex = 0;
    this._hitOpponent = false;
  }
}
