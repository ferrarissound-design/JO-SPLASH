import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Character } from '../src/entities/Character.js';
import { TEAM, HEALTH, MATCH } from '../src/config.js';

function makeCharacter() {
  return new Character(TEAM.PLAYER, new THREE.Vector3(0, 0, 0));
}

describe('Character damage/respawn lifecycle', () => {
  it('starts alive at full HP/ink with the match invincibility window active', () => {
    const c = makeCharacter();
    expect(c.alive).toBe(true);
    expect(c.hp).toBe(HEALTH.max);
    expect(c.invincibleTimer).toBeCloseTo(MATCH.invincibleSec);
  });

  it('ignores damage while the invincibility timer is still running', () => {
    const c = makeCharacter();
    const died = c.takeDamage(9999);
    expect(died).toBe(false);
    expect(c.hp).toBe(HEALTH.max);
  });

  it('takes damage normally once invincibility has elapsed', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    const died = c.takeDamage(30);
    expect(died).toBe(false);
    expect(c.hp).toBe(HEALTH.max - 30);
    expect(c.alive).toBe(true);
  });

  it('dies exactly when a hit brings HP to zero or below, and floors HP at zero', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    const died = c.takeDamage(HEALTH.max + 50);
    expect(died).toBe(true);
    expect(c.alive).toBe(false);
    expect(c.hp).toBe(0);
    expect(c.deaths).toBe(1);
    expect(c.respawnTimer).toBeCloseTo(MATCH.respawnDelaySec);
  });

  it('a dead character takes no further damage until respawned', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    c.takeDamage(HEALTH.max);
    expect(c.takeDamage(50)).toBe(false);
  });

  it('respawn() fully restores HP/ink/invincibility and clears death state', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    c.takeDamage(HEALTH.max);
    c.ink = 0;

    c.respawn();

    expect(c.alive).toBe(true);
    expect(c.hp).toBe(HEALTH.max);
    expect(c.invincibleTimer).toBeCloseTo(MATCH.invincibleSec);
    expect(c.position).toEqual(c.spawnPoint);
  });
});

describe('Character.updateHealthRegen', () => {
  it('does not regenerate during the post-damage regen delay', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    c.takeDamage(40);
    expect(c._healthRegenTimer).toBeCloseTo(HEALTH.regenDelaySec);

    c.updateHealthRegen(HEALTH.regenDelaySec - 0.1);
    expect(c.hp).toBe(HEALTH.max - 40);
  });

  it('regenerates HP once the delay has fully elapsed', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    c.takeDamage(40);

    c.updateHealthRegen(HEALTH.regenDelaySec); // burns through the delay
    const hpAfterDelay = c.hp;
    c.updateHealthRegen(1); // one more second should now add HP
    expect(c.hp).toBeGreaterThan(hpAfterDelay);
    expect(c.hp).toBeCloseTo(hpAfterDelay + HEALTH.regenPerSec, 5);
  });

  it('never regenerates past HEALTH.max', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    c.takeDamage(1);
    c.updateHealthRegen(HEALTH.regenDelaySec);
    c.updateHealthRegen(1000); // absurdly long tick
    expect(c.hp).toBe(HEALTH.max);
  });
});
