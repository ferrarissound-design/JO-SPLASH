import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { TEAM, WEAPON } from '../src/config.js';
import { ProjectileManager } from '../src/systems/ProjectileManager.js';

describe('SKY SPLASH projectile metadata', () => {
  it('keeps the launch tag until impact and reports it with the attacker team', () => {
    const scene = new THREE.Scene();
    const arena = {
      group: new THREE.Group(),
      paintableFloorMeshes: new Set(),
      climbPanelByMesh: new Map(),
    };
    const particles = {
      spawnSplat: vi.fn(),
      spawnChargedImpact: vi.fn(),
    };
    const manager = new ProjectileManager(
      scene,
      arena,
      { paintSplat: vi.fn() },
      particles,
      null,
    );
    const onCharacterHit = vi.fn();
    manager.onCharacterHit = onCharacterHit;

    expect(manager.spawn(
      new THREE.Vector3(0, 0.8, 0),
      new THREE.Vector3(0, 0, -1),
      TEAM.PLAYER,
      WEAPON.profiles.stream,
      { skySplash: true },
    )).toBe(true);

    const projectile = manager.pool.find((slot) => slot.active);
    expect(projectile.skySplash).toBe(true);
    expect(projectile.headMat.color.getHex()).toBe(0x9ffff5);

    manager.update(0.04, [{
      team: TEAM.CPU,
      alive: true,
      invincibleTimer: 0,
      position: new THREE.Vector3(0, 0, -1),
      hitboxHeight: 1.7,
    }]);

    expect(onCharacterHit).toHaveBeenCalledTimes(1);
    expect(onCharacterHit.mock.calls[0][3]).toEqual({
      attackerTeam: TEAM.PLAYER,
      skySplash: true,
    });
    expect(projectile.active).toBe(false);
  });
});
