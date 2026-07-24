import { SUB_WEAPON, TEAM } from '../config.js';

// A costly arcing ink payload. It shares ProjectileManager's collision and
// pooling path with main weapons, but trades fire rate and ink economy for a
// large paint burst and meaningful direct damage.
export class InkBomb {
  constructor() {
    this.cooldown = 0;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  fire(character, origin, direction, projectileManager, audioManager, particleManager) {
    if (!character.alive || character.inkSurfActive || character.isClimbing) return false;
    if (this.cooldown > 0 || character.ink < SUB_WEAPON.cost) return false;

    const spawned = projectileManager.spawn(origin, direction, character.team, SUB_WEAPON);
    if (!spawned) return false;

    character.ink -= SUB_WEAPON.cost;
    this.cooldown = SUB_WEAPON.cooldownSec;
    const color = character.team === TEAM.PLAYER ? 0x2fb8ff : 0xff7a2f;
    particleManager?.spawnMuzzle(origin, color);
    audioManager?.playBombThrow();
    return true;
  }
}
