import { SUB_WEAPON, TEAM } from '../config.js';

// A costly arcing ink payload. It shares ProjectileManager's collision and
// pooling path with main weapons, but trades fire rate and ink economy for a
// large paint burst and meaningful direct damage.
export const SUB_WEAPON_TYPES = Object.freeze({
  bomb: Object.freeze({ id: 'bomb', label: 'INK BOMB', cost: SUB_WEAPON.cost, cooldownSec: SUB_WEAPON.cooldownSec }),
  mine: Object.freeze({ id: 'mine', label: 'INK MINE', cost: 24, cooldownSec: 2.5 }),
  wall: Object.freeze({ id: 'wall', label: 'SPLASH WALL', cost: 32, cooldownSec: 4 }),
});

export class InkBomb {
  constructor(type = 'bomb') {
    this.cooldown = 0;
    this.setType(type);
  }

  setType(type) {
    this.type = SUB_WEAPON_TYPES[type] ? type : 'bomb';
    this.profile = SUB_WEAPON_TYPES[this.type];
    return this.type;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  fire(character, origin, direction, projectileManager, audioManager, particleManager) {
    if (!character.alive || character.inkSurfActive || character.isClimbing) return false;
    if (this.cooldown > 0 || character.ink < this.profile.cost) return false;

    if (this.type === 'mine' || this.type === 'wall') {
      const deployed = this.type === 'mine'
        ? projectileManager.gadgetSystem?.deployMine(character)
        : projectileManager.gadgetSystem?.deployWall(character, direction);
      if (!deployed) return false;
      character.ink -= this.profile.cost;
      this.cooldown = this.profile.cooldownSec;
      audioManager?.playBombThrow();
      return true;
    }

    const spawned = projectileManager.spawn(origin, direction, character.team, SUB_WEAPON);
    if (!spawned) return false;

    character.ink -= this.profile.cost;
    this.cooldown = this.profile.cooldownSec;
    const color = character.team === TEAM.PLAYER ? 0x2fb8ff : 0xff7a2f;
    particleManager?.spawnMuzzle(origin, color);
    audioManager?.playBombThrow();
    return true;
  }
}
