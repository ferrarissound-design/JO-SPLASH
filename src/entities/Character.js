import * as THREE from 'three';
import { HEALTH, INK, MOVEMENT, MATCH, TEAM, COLORS, ENEMY_FLOOR_EFFECT, CAMERA } from '../config.js';
import { Weapon } from '../systems/Weapon.js';

const _closest = new THREE.Vector2();
const _pushDir = new THREE.Vector2();

// ============================================================================
// Character — shared body/stats/collision logic used by both the
// human-controlled Player and the CPU-controlled EnemyAI. Neither subclass
// duplicates mesh construction, HP/ink bookkeeping, respawn flow, obstacle
// collision, or ground-height resolution; they only add their own
// input/decision layer on top.
// ============================================================================
export class Character {
  constructor(team, spawnPoint) {
    this.team = team;
    this.spawnPoint = spawnPoint.clone();

    this.position = spawnPoint.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = 0; // visual facing, radians
    this.grounded = true;

    this.hp = HEALTH.max;
    this.ink = INK.max;
    this.alive = true;
    this.invincibleTimer = MATCH.invincibleSec;
    this.respawnTimer = 0;

    this.koScored = 0; // times this character has defeated the opponent
    this.deaths = 0;

    this.inkSurfActive = false;
    this.inkSurfCooldown = 0;
    this.onEnemyFloor = false;
    this._enemyFloorDamageAccum = 0;
    this._floorFxTimer = 0;

    const isPlayer = team === TEAM.PLAYER;
    const color = isPlayer ? COLORS.player : COLORS.cpu;
    const deep = isPlayer ? COLORS.playerDeep : COLORS.cpuDeep;
    // Virtual hook: subclasses may replace the visual rig (e.g. EnemyAI's
    // appearance variations) without touching stats/collision. Runs during the
    // base constructor, so overrides must only read their arguments.
    const { group, rig, materials } = this._createMesh(color, deep);
    this.mesh = group;
    this.rig = rig;
    this.materials = materials;

    this.mesh.position.copy(this.position);
    this.weapon = new Weapon();
  }

  /** Overridable rig factory. Base uses the default shared body. */
  _createMesh(color, deep) {
    return Character.buildMesh(color, deep);
  }

  static buildMesh(color, deep) {
    const group = new THREE.Group();
    const rig = new THREE.Group();
    group.add(rig);

    const materials = [];
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 });
    const deepMat = new THREE.MeshStandardMaterial({ color: deep, roughness: 0.5, metalness: 0.2 });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xf4faff,
      emissive: 0x224455,
      roughness: 0.3,
      metalness: 0.1,
    });
    materials.push(bodyMat, deepMat, visorMat);

    // Torso: single capsule, feet at local y=0, top at y=capsuleHeight.
    const torsoLen = MOVEMENT.capsuleHeight - MOVEMENT.capsuleRadius * 2;
    const torsoGeo = new THREE.CapsuleGeometry(MOVEMENT.capsuleRadius, torsoLen, 4, 12);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = MOVEMENT.capsuleHeight / 2;
    rig.add(torso);

    // Head: small sphere sitting atop the torso.
    const headGeo = new THREE.SphereGeometry(0.27, 14, 12);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = MOVEMENT.capsuleHeight + 0.12;
    rig.add(head);

    // Visor band: indicates facing direction at a glance.
    const visorGeo = new THREE.BoxGeometry(0.4, 0.1, 0.06);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, MOVEMENT.capsuleHeight + 0.14, -0.24);
    rig.add(visor);

    // Shoulder pads: deep-tone accents, also break up silhouette from behind.
    const padGeo = new THREE.BoxGeometry(0.22, 0.22, 0.3);
    const padL = new THREE.Mesh(padGeo, deepMat);
    padL.position.set(-0.42, MOVEMENT.capsuleHeight - 0.15, 0);
    rig.add(padL);
    const padR = padL.clone();
    padR.position.x = 0.42;
    rig.add(padR);

    // Back fin: small original silhouette detail, also a rear-facing indicator.
    const finGeo = new THREE.ConeGeometry(0.16, 0.4, 4);
    const fin = new THREE.Mesh(finGeo, deepMat);
    fin.position.set(0, MOVEMENT.capsuleHeight + 0.05, 0.32);
    fin.rotation.x = Math.PI / 2.4;
    rig.add(fin);

    return { group, rig, materials };
  }

  get isPlayer() {
    return this.team === TEAM.PLAYER;
  }

  get eyeHeight() {
    return CAMERA.eyeHeight;
  }

  /** Apply damage; returns true if this hit resulted in a KO. */
  takeDamage(amount) {
    if (!this.alive || this.invincibleTimer > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this.inkSurfActive = false;
    this.inkSurfCooldown = 0;
    this.deaths++;
    this.respawnTimer = MATCH.respawnDelaySec;
    this.velocity.set(0, 0, 0);
  }

  respawn() {
    this.alive = true;
    this.hp = HEALTH.max;
    this.ink = INK.max;
    this.invincibleTimer = MATCH.invincibleSec;
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.inkSurfActive = false;
    this.inkSurfCooldown = 0;
  }

  /** Resolve horizontal collisions against arena obstacles/walls (circle vs box/circle). */
  resolveObstacleCollisions(arena) {
    const r = MOVEMENT.capsuleRadius;

    for (const box of arena.boxColliders) {
      if (this.position.y >= box.height) continue; // v1: cannot stand atop obstacles
      const cx = THREE.MathUtils.clamp(this.position.x, box.min.x, box.max.x);
      const cz = THREE.MathUtils.clamp(this.position.z, box.min.y, box.max.y);
      _closest.set(cx, cz);
      const dx = this.position.x - cx;
      const dz = this.position.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < r * r) {
        const dist = Math.sqrt(distSq) || 0.0001;
        _pushDir.set(dx / dist, dz / dist);
        const overlap = r - dist;
        this.position.x += _pushDir.x * overlap;
        this.position.z += _pushDir.y * overlap;
      }
    }

    for (const cyl of arena.cylinderColliders) {
      if (this.position.y >= cyl.height) continue;
      const dx = this.position.x - cyl.center.x;
      const dz = this.position.z - cyl.center.y;
      const distSq = dx * dx + dz * dz;
      const minDist = r + cyl.radius;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const overlap = minDist - dist;
        this.position.x += (dx / dist) * overlap;
        this.position.z += (dz / dist) * overlap;
      }
    }

    const [cx, cz] = arena.clampToBounds(this.position.x, this.position.z, r + 0.3);
    this.position.x = cx;
    this.position.z = cz;
  }

  /** Vertical integration: gravity, ground snap, jump consumption handled by caller. */
  applyVerticalPhysics(dt, arena) {
    const groundY = arena.getGroundHeight(this.position.x, this.position.z);

    this.velocity.y = Math.max(this.velocity.y + MOVEMENT.gravity * dt, MOVEMENT.maxFallSpeed);
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  /** Apply per-frame floor-based effects (ink-surf boost / enemy-floor slow+damage). Returns speed multiplier. */
  updateFloorEffects(dt, paintSystem, wantsInkSurf) {
    if (this.inkSurfCooldown > 0) this.inkSurfCooldown = Math.max(0, this.inkSurfCooldown - dt);

    if (!this.grounded) {
      this.inkSurfActive = false;
      this.onEnemyFloor = false;
      return 1;
    }

    const owner = paintSystem.getOwnerAt(this.position.x, this.position.z);
    const enemyTeam = this.team === TEAM.PLAYER ? TEAM.CPU : TEAM.PLAYER;

    this.onEnemyFloor = owner === enemyTeam;
    const canInkSurf = wantsInkSurf && owner === this.team && this.inkSurfCooldown <= 0;
    this.inkSurfActive = canInkSurf;

    let speedMult = 1;
    if (this.inkSurfActive) {
      speedMult = MOVEMENT.inkSurfSpeedMult;
      this.ink = Math.min(INK.max, this.ink + INK.regenSurf * dt);
    } else if (this.onEnemyFloor) {
      speedMult = MOVEMENT.enemyPaintSlowMult;
      this._enemyFloorDamageAccum += dt;
      if (this._enemyFloorDamageAccum >= ENEMY_FLOOR_EFFECT.tickIntervalSec && this.alive && this.invincibleTimer <= 0) {
        this._enemyFloorDamageAccum = 0;
        const tickDamage = ENEMY_FLOOR_EFFECT.damagePerSecond * ENEMY_FLOOR_EFFECT.tickIntervalSec;
        const dmg = Math.min(this.hp - 1, tickDamage); // environmental chip alone never finishes a KO
        if (dmg > 0) this.hp -= dmg;
      }
      this.ink = Math.min(INK.max, this.ink + INK.regenEnemyFloor * dt);
    } else if (owner === this.team) {
      this.ink = Math.min(INK.max, this.ink + INK.regenOwnFloor * dt);
    } else {
      this.ink = Math.min(INK.max, this.ink + INK.regenNeutral * dt);
    }

    return speedMult;
  }

  /** Spawns lightweight footfall particles for ink-surfing / enemy-floor danger cues. */
  updateFloorParticles(dt, particleManager) {
    this._floorFxTimer -= dt;
    if (this._floorFxTimer > 0 || !this.grounded) return;

    if (this.inkSurfActive) {
      this._floorFxTimer = 0.09;
      const own = this.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
      particleManager.spawnInkSurfTrail(
        new THREE.Vector3(this.position.x, this.position.y + 0.05, this.position.z),
        own
      );
    } else if (this.onEnemyFloor) {
      this._floorFxTimer = 0.15;
      const enemy = this.team === TEAM.PLAYER ? COLORS.cpu : COLORS.player;
      particleManager.spawnEnemyFloorSpray(
        new THREE.Vector3(this.position.x, this.position.y + 0.05, this.position.z),
        enemy
      );
    }
  }

  updateTimers(dt) {
    if (this.invincibleTimer > 0) this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
    }
  }

  /** Sync the Three.js mesh transform + invincibility flicker to current state. */
  syncMesh(elapsedTime) {
    this.mesh.position.copy(this.position);
    this.mesh.visible = this.alive;
    this.mesh.rotation.y = this.yaw;

    const crouchOffset = this.inkSurfActive ? MOVEMENT.inkSurfBodySink : 0;
    this.rig.position.y = THREE.MathUtils.lerp(this.rig.position.y, crouchOffset, 0.25);

    if (this.invincibleTimer > 0) {
      const flicker = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(elapsedTime * 18));
      for (const m of this.materials) {
        m.transparent = true;
        m.opacity = flicker;
      }
    } else {
      for (const m of this.materials) {
        m.transparent = false;
        m.opacity = 1;
      }
    }
  }

  dispose() {
    this.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
