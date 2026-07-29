import * as THREE from 'three';
import { COLORS, JUMP_PAD, TEAM, THEME } from '../config.js';

const PAD_DEFS = Object.freeze([
  Object.freeze({ x: -12, z: 8, targetX: -2.4, targetZ: 1.6 }),
  Object.freeze({ x: 12, z: -8, targetX: 2.4, targetZ: -1.6 }),
]);

const _fxPosition = new THREE.Vector3();

export function isCharacterOnJumpPad(character, pad, radius = JUMP_PAD.triggerRadius) {
  if (!character?.alive || !character.grounded || !character.position) return false;
  const dx = character.position.x - pad.position.x;
  const dz = character.position.z - pad.position.z;
  return dx * dx + dz * dz <= radius * radius;
}

export function launchCharacterFromPad(character, pad) {
  if (!isCharacterOnJumpPad(character, pad)) return false;
  character.launchFromJumpPad(
    pad.direction,
    JUMP_PAD.verticalSpeed,
    JUMP_PAD.horizontalSpeed,
    JUMP_PAD.directionLockSec,
  );
  return true;
}

export class JumpPadSystem {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'JumpPads';
    this.pads = PAD_DEFS.map((definition, index) => this._createPad(definition, index));
    this._cooldowns = new WeakMap();
    scene.add(this.group);
  }

  _createPad(definition, index) {
    const position = new THREE.Vector3(definition.x, 0, definition.z);
    const direction = new THREE.Vector3(
      definition.targetX - definition.x,
      0,
      definition.targetZ - definition.z,
    ).normalize();

    const group = new THREE.Group();
    group.name = `JumpPad${index + 1}`;
    group.position.copy(position);
    group.rotation.y = Math.atan2(-direction.x, -direction.z);

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x111b35,
      emissive: 0x071426,
      emissiveIntensity: 0.55,
      roughness: 0.42,
      metalness: 0.65,
    });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: THEME.neonCyan,
      emissive: THEME.neonCyan,
      emissiveIntensity: 1.5,
      roughness: 0.28,
      metalness: 0.18,
    });
    const ringMaterial = glowMaterial.clone();
    ringMaterial.transparent = true;
    ringMaterial.opacity = 0.82;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.34, 0.12, 20), baseMaterial);
    base.position.y = 0.06;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 0.16, 20), glowMaterial);
    core.position.y = 0.11;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.075, 7, 24), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;

    const arrows = new THREE.Group();
    arrows.position.y = 0.22;
    for (let i = 0; i < 2; i++) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.52, 3), glowMaterial);
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.z = 0.27 - i * 0.55;
      arrows.add(arrow);
    }

    group.add(base, core, ring, arrows);
    this.group.add(group);

    return {
      position,
      direction,
      group,
      core,
      ring,
      arrows,
      flash: 0,
      phase: index * Math.PI,
    };
  }

  reset() {
    this._cooldowns = new WeakMap();
    for (const pad of this.pads) pad.flash = 0;
  }

  update(dt, characters, { particleManager = null, audioManager = null, ui = null } = {}) {
    for (const pad of this.pads) {
      pad.phase += dt * 2.4;
      pad.flash = Math.max(0, pad.flash - dt * 3.2);
      const idlePulse = 1 + Math.sin(pad.phase) * 0.035;
      const launchPulse = pad.flash * 0.2;
      pad.core.scale.set(1 + launchPulse, 1, 1 + launchPulse);
      pad.ring.scale.setScalar(idlePulse + launchPulse);
      pad.ring.rotation.z += dt * 1.7;
      pad.ring.material.opacity = 0.68 + pad.flash * 0.28;
      pad.core.material.emissiveIntensity = 1.35 + pad.flash * 1.8;
      pad.arrows.position.y = 0.22 + Math.sin(pad.phase * 1.4) * 0.025 + pad.flash * 0.08;
    }

    for (const character of characters) {
      if (!character) continue;
      const cooldown = Math.max(0, (this._cooldowns.get(character) ?? 0) - dt);
      this._cooldowns.set(character, cooldown);
      if (cooldown > 0) continue;

      const pad = this.pads.find((candidate) => isCharacterOnJumpPad(character, candidate));
      if (!pad || !launchCharacterFromPad(character, pad)) continue;

      this._cooldowns.set(character, JUMP_PAD.retriggerCooldownSec);
      pad.flash = 1;
      _fxPosition.set(pad.position.x, 0.18, pad.position.z);
      const color = character.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
      particleManager?.spawnSplat(_fxPosition, color, true);
      audioManager?.playJumpPad();
      if (character.team === TEAM.PLAYER) ui?.showStatusMessage('BOOST LAUNCH!', 0.7);
    }
  }
}
