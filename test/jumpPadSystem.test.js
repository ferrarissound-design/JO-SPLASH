import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { JUMP_PAD, TEAM } from '../src/config.js';
import { Character } from '../src/entities/Character.js';
import {
  isCharacterOnJumpPad,
  launchCharacterFromPad,
  JumpPadSystem,
} from '../src/systems/JumpPadSystem.js';

const makeCharacter = (overrides = {}) => ({
  alive: true,
  grounded: true,
  team: TEAM.PLAYER,
  position: new THREE.Vector3(-12, 0, 8),
  velocity: new THREE.Vector3(),
  launchFromJumpPad: vi.fn(function launch(direction, verticalSpeed, horizontalSpeed, lockSec) {
    this.velocity.set(direction.x * horizontalSpeed, verticalSpeed, direction.z * horizontalSpeed);
    this.grounded = false;
    this.lockSec = lockSec;
  }),
  ...overrides,
});

describe('jump pad trigger helpers', () => {
  const pad = {
    position: new THREE.Vector3(-12, 0, 8),
    direction: new THREE.Vector3(1, 0, 0),
  };

  it('only triggers a living grounded character inside the pad radius', () => {
    expect(isCharacterOnJumpPad(makeCharacter(), pad)).toBe(true);
    expect(isCharacterOnJumpPad(makeCharacter({ grounded: false }), pad)).toBe(false);
    expect(isCharacterOnJumpPad(makeCharacter({ alive: false }), pad)).toBe(false);
    expect(isCharacterOnJumpPad(makeCharacter({
      position: new THREE.Vector3(-12 + JUMP_PAD.triggerRadius + 0.01, 0, 8),
    }), pad)).toBe(false);
  });

  it('applies the shared launch speeds and direction lock', () => {
    const character = makeCharacter();
    expect(launchCharacterFromPad(character, pad)).toBe(true);
    expect(character.launchFromJumpPad).toHaveBeenCalledWith(
      pad.direction,
      JUMP_PAD.verticalSpeed,
      JUMP_PAD.horizontalSpeed,
      JUMP_PAD.directionLockSec,
    );
    expect(character.velocity.y).toBe(JUMP_PAD.verticalSpeed);
    expect(character.velocity.x).toBe(JUMP_PAD.horizontalSpeed);
  });

  it('keeps and resets the shared directional boost on a real character', () => {
    const character = new Character(TEAM.PLAYER, new THREE.Vector3());
    character.launchFromJumpPad(pad.direction, 10, 7, 0.3);
    character.velocity.x = 1;
    character.preserveJumpPadBoost();
    expect(character.velocity.x).toBe(7);
    expect(character.velocity.y).toBe(10);

    character.resetJumpPadBoost();
    expect(character.jumpPadBoostTimer).toBe(0);
    expect(character.jumpPadDirection.lengthSq()).toBe(0);
  });
});

describe('JumpPadSystem', () => {
  it('builds two lightweight pads and enforces the retrigger cooldown', () => {
    const scene = new THREE.Scene();
    const system = new JumpPadSystem(scene);
    const character = makeCharacter();
    const particleManager = { spawnSplat: vi.fn() };
    const audioManager = { playJumpPad: vi.fn() };
    const ui = { showStatusMessage: vi.fn() };

    expect(system.pads).toHaveLength(2);
    expect(scene.getObjectByName('JumpPads')).toBe(system.group);

    system.update(0.016, [character], { particleManager, audioManager, ui });
    expect(character.launchFromJumpPad).toHaveBeenCalledTimes(1);
    expect(particleManager.spawnSplat).toHaveBeenCalledTimes(1);
    expect(audioManager.playJumpPad).toHaveBeenCalledTimes(1);
    expect(ui.showStatusMessage).toHaveBeenCalledWith('BOOST LAUNCH!', 0.7);

    character.grounded = true;
    system.update(0.1, [character], { particleManager, audioManager, ui });
    expect(character.launchFromJumpPad).toHaveBeenCalledTimes(1);
  });

  it('does not show the player message when the CPU launches', () => {
    const system = new JumpPadSystem(new THREE.Scene());
    const cpu = makeCharacter({ team: TEAM.CPU });
    const ui = { showStatusMessage: vi.fn() };
    system.update(0.016, [cpu], { ui });
    expect(cpu.launchFromJumpPad).toHaveBeenCalledTimes(1);
    expect(ui.showStatusMessage).not.toHaveBeenCalled();
  });
});
