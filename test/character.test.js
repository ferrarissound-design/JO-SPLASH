import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Character } from '../src/entities/Character.js';
import {
  TEAM, HEALTH, MATCH, HIT_COMBO, INK, MOVEMENT, GEAR_POWERS,
} from '../src/config.js';

function makeCharacter() {
  return new Character(TEAM.PLAYER, new THREE.Vector3(0, 0, 0));
}

/** Minimal PaintSystem stand-in: reports the floor at the character's position as owned by `owner`. */
function makePaintSystem(owner) {
  return { getOwnerAt: () => owner };
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

  it('applies an active special\'s damageMultiplier (e.g. COLOR SHIELD) to incoming hits', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    c.special = { damageMultiplier: 0.5 };
    c.takeDamage(40);
    expect(c.hp).toBe(HEALTH.max - 20);
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

describe('Character gear powers (config.GEAR_POWERS, equipped via gearPower)', () => {
  it('is a no-op by default: full respawn delay, unboosted ink regen and surf speed', () => {
    const c = makeCharacter();
    c.invincibleTimer = 0;
    c.die();
    expect(c.respawnTimer).toBeCloseTo(MATCH.respawnDelaySec);

    const c2 = makeCharacter();
    c2.ink = 0;
    const speedMult = c2.updateFloorEffects(1, makePaintSystem(TEAM.PLAYER), false);
    expect(speedMult).toBe(1);
    expect(c2.ink).toBeCloseTo(INK.regenOwnFloor);
  });

  it('quickRespawn shortens the respawn delay', () => {
    const c = makeCharacter();
    c.gearPower = GEAR_POWERS.quickRespawn;
    c.invincibleTimer = 0;
    c.die();
    expect(c.respawnTimer).toBeCloseTo(MATCH.respawnDelaySec * GEAR_POWERS.quickRespawn.respawnMult);
  });

  it('aquaRevival boosts own-floor and surf ink regen', () => {
    const c = makeCharacter();
    c.gearPower = GEAR_POWERS.aquaRevival;
    c.ink = 0;
    c.updateFloorEffects(1, makePaintSystem(TEAM.PLAYER), false);
    expect(c.ink).toBeCloseTo(INK.regenOwnFloor * GEAR_POWERS.aquaRevival.inkRegenMult);

    const c2 = makeCharacter();
    c2.gearPower = GEAR_POWERS.aquaRevival;
    c2.ink = 0;
    c2.updateFloorEffects(1, makePaintSystem(TEAM.PLAYER), true); // wantsInkSurf, own floor -> surfing
    expect(c2.inkSurfActive).toBe(true);
    expect(c2.ink).toBeCloseTo(INK.regenSurf * GEAR_POWERS.aquaRevival.inkRegenMult);
  });

  it('surfBoost speeds up ink-surf movement only, not the base speed multiplier', () => {
    const c = makeCharacter();
    c.gearPower = GEAR_POWERS.surfBoost;
    const speedMult = c.updateFloorEffects(1, makePaintSystem(TEAM.PLAYER), true);
    expect(c.inkSurfActive).toBe(true);
    expect(speedMult).toBeCloseTo(MOVEMENT.inkSurfSpeedMult * GEAR_POWERS.surfBoost.surfSpeedMult);

    const c2 = makeCharacter();
    c2.gearPower = GEAR_POWERS.surfBoost;
    const groundedSpeedMult = c2.updateFloorEffects(1, makePaintSystem(TEAM.PLAYER), false);
    expect(groundedSpeedMult).toBe(1); // not surfing -> surfBoost has nothing to apply to
  });
});

describe('Character hit combo tracking', () => {
  it('extends a streak inside the combo window and records the best count', () => {
    const c = makeCharacter();

    expect(c.registerHitCombo()).toBe(1);
    c.updateHitCombo(HIT_COMBO.windowSec - 0.1);
    expect(c.registerHitCombo()).toBe(2);
    expect(c.bestHitCombo).toBe(2);
  });

  it('starts a new streak after the combo window expires', () => {
    const c = makeCharacter();
    c.registerHitCombo();
    c.registerHitCombo();

    c.updateHitCombo(HIT_COMBO.windowSec);

    expect(c.hitCombo).toBe(0);
    expect(c.registerHitCombo()).toBe(1);
    expect(c.bestHitCombo).toBe(2);
  });

  it('clears the current streak on defeat but preserves the match best', () => {
    const c = makeCharacter();
    c.registerHitCombo();
    c.registerHitCombo();
    c.invincibleTimer = 0;

    c.takeDamage(HEALTH.max);

    expect(c.hitCombo).toBe(0);
    expect(c.bestHitCombo).toBe(2);
  });
});
