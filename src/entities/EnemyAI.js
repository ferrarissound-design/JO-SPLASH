import * as THREE from 'three';
import { Character } from './Character.js';
import { MOVEMENT, WEAPON, AI, TEAM } from '../config.js';
import {
  createEnemyCharacter,
  populateEnemyRig,
  randomizeEnemyAppearance,
  disposeEnemyMaterials,
  enemyAppearancePresets,
  randInt,
} from './EnemyAppearance.js';

// Short "pop-in" the enemy plays whenever it (re)appears: rises from just
// below the floor and scales up from tiny to full. Purely visual.
const ENEMY_INTRO_DURATION = 0.42;
function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

const STATE = {
  PAINT: 'paint',
  ATTACK: 'attack',
  RETAKE: 'retake',
  REFILL: 'refill',
  FLEE: 'flee',
  EXPLORE: 'explore',
  WAIT_RESPAWN: 'wait_respawn',
};

const _toTarget = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();
const _steerDir = new THREE.Vector3();
const _eyeA = new THREE.Vector3();
const _eyeB = new THREE.Vector3();
const _aimVec = new THREE.Vector3();
const _fireOrigin = new THREE.Vector3();
const _predictedPos = new THREE.Vector3();
const _probeOrigin = new THREE.Vector3();
const _losRay = new THREE.Raycaster();
const _probeRay = new THREE.Raycaster();
const _deflectDir = new THREE.Vector3();
const _wishSnapshot = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

function yawFromDirection(dx, dz) {
  return Math.atan2(-dx, -dz);
}

// ============================================================================
// EnemyAI — CPU-controlled Character. Re-evaluates a small state machine
// every ~0.25-0.5s (not every frame) and executes simple steering movement +
// imperfect aim toward whatever the current state's target is. No NavMesh:
// obstacle avoidance is a short forward probe raycast that nudges the wish
// direction sideways when blocked.
// ============================================================================
export class EnemyAI extends Character {
  constructor(spawnPoint, difficulty = {}) {
    super(TEAM.CPU, spawnPoint);

    // Intro animation / name-banner state (set here so it exists before the
    // first update; _createMesh already picked the initial appearance below).
    this._introTimer = 0;
    this._introBannerPending = false;

    this.difficulty = {
      reactionDelay: AI.reactionDelaySec,
      aimJitterMult: 1,
      decisionIntervalMult: 1,
      ...difficulty,
    };

    this.state = STATE.EXPLORE;
    this._decisionTimer = 0;
    this.targetPoint = spawnPoint.clone();
    this._strafeSign = 1;
    this._strafeTimer = 0;

    this._aimDir = new THREE.Vector3(0, 0, -1);
    this._aimSmoothT = 0;

    this._stuckCheckTimer = 0;
    this._stuckLastPos = spawnPoint.clone();

    this._recentWaypoints = [];
    this.debugTarget = null; // exposed for debug overlay
  }

  // ---------------------------------------------------------- appearance
  // Cosmetic only. Nothing below reads/writes HP, AI, movement or collision;
  // it swaps the rig's child meshes/materials while keeping the same root
  // object (this.mesh), team tag and colliders intact.

  /** Base-constructor hook: build a randomized appearance instead of the default body. */
  _createMesh() {
    const typeIndex = randInt(0, enemyAppearancePresets.length - 1);
    const cfg = randomizeEnemyAppearance(typeIndex);
    this._setAppearanceMeta(typeIndex, cfg);
    return createEnemyCharacter(cfg);
  }

  _setAppearanceMeta(typeIndex, cfg) {
    this.appearanceType = typeIndex;
    this.appearance = cfg;
    this.appearanceId = cfg.id;
    this.appearanceName = cfg.name;
  }

  /** Rebuild the rig in place with a new appearance type (randomized colours/details). */
  applyAppearance(typeIndex, { playIntro = true } = {}) {
    disposeEnemyMaterials(this.materials);
    while (this.rig.children.length) this.rig.remove(this.rig.children[0]);

    const cfg = randomizeEnemyAppearance(typeIndex);
    this.materials = populateEnemyRig(this.rig, cfg);
    this._setAppearanceMeta(typeIndex, cfg);
    console.log('[Enemy Appearance]', this.appearanceId);

    if (playIntro) this.playIntro();
  }

  /** Roll a fresh random appearance type (used at match start). */
  randomizeAppearance(opts) {
    this.applyAppearance(randInt(0, enemyAppearancePresets.length - 1), opts);
  }

  /** Debug helper: Speed -> Street -> Heavy -> Technical -> Speed. */
  cycleEnemyAppearance() {
    const next = ((this.appearanceType ?? 0) + 1) % enemyAppearancePresets.length;
    this.applyAppearance(next);
    return this.appearanceId;
  }

  /** Kick off the rise-and-pop entrance and flag the name banner for the UI. */
  playIntro() {
    this._introTimer = ENEMY_INTRO_DURATION;
    this._introBannerPending = true;
  }

  /** True once, on the frame after an intro started, so Game can show the name. */
  consumeIntroBanner() {
    if (this._introBannerPending) {
      this._introBannerPending = false;
      return true;
    }
    return false;
  }

  update(dt, ctx) {
    const { arena, paintSystem, projectileManager, particleManager, audioManager, player, controlsEnabled } = ctx;

    this.updateTimers(dt);
    if (this._introTimer > 0) this._introTimer = Math.max(0, this._introTimer - dt);
    if (!this.alive) {
      this.state = STATE.WAIT_RESPAWN;
      this.syncMesh(ctx.elapsedTime);
      return;
    }
    if (!controlsEnabled) {
      this.syncMesh(ctx.elapsedTime);
      return;
    }

    this.weapon.update(dt);

    this._decisionTimer -= dt;
    if (this._decisionTimer <= 0) {
      this._reevaluate(arena, paintSystem, player);
      this._decisionTimer = THREE.MathUtils.lerp(AI.decisionIntervalMin, AI.decisionIntervalMax, Math.random())
        * this.difficulty.decisionIntervalMult;
    }

    this._act(dt, arena, paintSystem, projectileManager, particleManager, audioManager, player);

    const wantsInkSurf = paintSystem.getOwnerAt(this.position.x, this.position.z) === TEAM.CPU;
    const speedMult = this.updateFloorEffects(dt, paintSystem, wantsInkSurf);
    this._lastSpeedMult = speedMult;
    this.updateFloorParticles(dt, particleManager);

    this.syncMesh(ctx.elapsedTime);
  }

  // ---------------------------------------------------------------- decide
  _reevaluate(arena, paintSystem, player) {
    const dist = this.position.distanceTo(player.position);
    const hasLOS = this._hasLineOfSight(arena, player);

    if (this.hp < AI.fleeHpThreshold) {
      this.state = STATE.FLEE;
      this.targetPoint = this._findFleeTarget(arena, paintSystem, player);
      return;
    }

    if (dist <= AI.attackRange && hasLOS && this.ink >= WEAPON.costPerShot * 2) {
      this.state = STATE.ATTACK;
      return;
    }

    if (this.ink < AI.refillInkThreshold) {
      this.state = STATE.REFILL;
      this.targetPoint = this._findOwnTarget(arena, paintSystem);
      return;
    }

    const survey = this._surveySurroundings(arena, paintSystem);
    if (survey.enemyCount >= survey.sampleCount * 0.4 && survey.enemyPoint) {
      this.state = STATE.RETAKE;
      this.targetPoint = survey.enemyPoint;
      return;
    }

    if (survey.neutralPoint) {
      this.state = STATE.PAINT;
      this.targetPoint = survey.neutralPoint;
      return;
    }

    this.state = STATE.EXPLORE;
    this.targetPoint = this._findExploreTarget(arena);
  }

  _hasLineOfSight(arena, player) {
    _eyeA.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    _eyeB.set(player.position.x, player.position.y + player.eyeHeight, player.position.z);
    _toPlayer.subVectors(_eyeB, _eyeA);
    const dist = _toPlayer.length();
    if (dist < 0.01) return true;
    _toPlayer.normalize();

    _losRay.set(_eyeA, _toPlayer);
    _losRay.far = dist - 0.3;
    _losRay.near = 0;
    const blockers = this._sightBlockers || (this._sightBlockers = arena.group.children.filter((m) => m !== arena.floorMesh));
    const hits = _losRay.intersectObjects(blockers, false);
    return hits.length === 0;
  }

  _surveySurroundings(arena, paintSystem) {
    const radius = 8;
    const sampleCount = 10;
    let enemyCount = 0, neutralCount = 0, ownCount = 0;
    let enemyPoint = null, neutralPoint = null;

    for (let i = 0; i < sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2 + Math.random() * 0.5;
      const r = radius * (0.4 + Math.random() * 0.6);
      const x = this.position.x + Math.cos(angle) * r;
      const z = this.position.z + Math.sin(angle) * r;
      const [cx, cz] = arena.clampToBounds(x, z, 1.5);
      const owner = paintSystem.getOwnerAt(cx, cz);

      if (owner === TEAM.PLAYER) {
        enemyCount++;
        if (!enemyPoint) enemyPoint = new THREE.Vector3(cx, 0, cz);
      } else if (owner === null) {
        neutralCount++;
        if (!neutralPoint) neutralPoint = new THREE.Vector3(cx, 0, cz);
      } else {
        ownCount++;
      }
    }

    return { enemyCount, neutralCount, ownCount, sampleCount, enemyPoint, neutralPoint };
  }

  _findOwnTarget(arena, paintSystem) {
    const owner = paintSystem.getOwnerAt(this.position.x, this.position.z);
    if (owner === TEAM.CPU) return this.position.clone();

    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 6;
      const x = this.position.x + Math.cos(angle) * r;
      const z = this.position.z + Math.sin(angle) * r;
      const [cx, cz] = arena.clampToBounds(x, z, 1.5);
      if (paintSystem.getOwnerAt(cx, cz) === TEAM.CPU) return new THREE.Vector3(cx, 0, cz);
    }
    return this.spawnPoint.clone();
  }

  _findFleeTarget(arena, paintSystem, player) {
    _toPlayer.subVectors(this.position, player.position);
    _toPlayer.y = 0;
    if (_toPlayer.lengthSq() < 0.01) _toPlayer.set(1, 0, 0);
    _toPlayer.normalize();

    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * Math.PI * 0.9;
      const angle = Math.atan2(_toPlayer.x, _toPlayer.z) + spread;
      const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const dist = 8 + Math.random() * 6;
      const x = this.position.x + dir.x * dist;
      const z = this.position.z + dir.z * dist;
      const [cx, cz] = arena.clampToBounds(x, z, 1.5);
      const owner = paintSystem.getOwnerAt(cx, cz);
      const score = (owner === TEAM.CPU ? 3 : owner === null ? 1 : 0) + dist * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = new THREE.Vector3(cx, 0, cz);
      }
    }
    return best || this.spawnPoint.clone();
  }

  _findExploreTarget(arena) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = (Math.random() * 2 - 1) * (arena.halfWidth - 3);
      const z = (Math.random() * 2 - 1) * (arena.halfDepth - 3);
      const candidate = new THREE.Vector3(x, 0, z);

      const tooCloseToRecent = this._recentWaypoints.some((w) => w.distanceTo(candidate) < 6);
      if (!tooCloseToRecent) {
        this._recentWaypoints.push(candidate);
        if (this._recentWaypoints.length > 4) this._recentWaypoints.shift();
        return candidate;
      }
    }
    return new THREE.Vector3(
      THREE.MathUtils.clamp(this.position.x + (Math.random() - 0.5) * 10, -arena.halfWidth + 3, arena.halfWidth - 3),
      0,
      THREE.MathUtils.clamp(this.position.z + (Math.random() - 0.5) * 10, -arena.halfDepth + 3, arena.halfDepth - 3)
    );
  }

  // ------------------------------------------------------------------ act
  _act(dt, arena, paintSystem, projectileManager, particleManager, audioManager, player) {
    this.debugTarget = this.targetPoint;

    if (this.state === STATE.ATTACK) {
      this._actAttack(dt, arena, projectileManager, particleManager, audioManager, player);
    } else {
      this._actMoveTo(dt, arena, this.targetPoint);
      if (this.state === STATE.PAINT || this.state === STATE.RETAKE) {
        this._actPaintGround(projectileManager, particleManager, audioManager);
      }
    }
  }

  // Fires at the floor a couple meters ahead of its current heading so
  // "paint" / "retake" states actually leave ink as the CPU walks its route,
  // rather than only ever firing at the player during ATTACK.
  _actPaintGround(projectileManager, particleManager, audioManager) {
    if (!this.weapon.canFire(this)) return;

    _moveDir.set(this.velocity.x, 0, this.velocity.z);
    if (_moveDir.lengthSq() < 0.01) _moveDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _moveDir.normalize();

    const aheadDist = 2 + Math.random() * 2;
    _predictedPos.set(this.position.x + _moveDir.x * aheadDist, 0, this.position.z + _moveDir.z * aheadDist);

    _eyeA.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    _aimVec.subVectors(_predictedPos, _eyeA).normalize();
    _fireOrigin.copy(_eyeA).addScaledVector(_aimVec, 0.4);

    this.weapon.fire(this, _fireOrigin, _aimVec, projectileManager, audioManager, particleManager);
  }

  _actMoveTo(dt, arena, target) {
    _toTarget.set(target.x - this.position.x, 0, target.z - this.position.z);
    const dist = _toTarget.length();

    if (dist < 0.6) {
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
      this._integrateHorizontal(dt, arena);
      return;
    }
    _toTarget.normalize();

    const avoided = this._avoidObstacles(arena, _toTarget);
    const speedMult = this._lastSpeedMult ?? 1;
    const speed = MOVEMENT.walkSpeed * speedMult * AI.moveSpeedMult;

    this.velocity.x = avoided.x * speed;
    this.velocity.z = avoided.z * speed;
    this.yaw = yawFromDirection(avoided.x, avoided.z);

    this._integrateHorizontal(dt, arena);
    this._checkStuck(dt, arena);
  }

  _actAttack(dt, arena, projectileManager, particleManager, audioManager, player) {
    // Strafe to stay mobile rather than standing still while shooting.
    this._strafeTimer -= dt;
    if (this._strafeTimer <= 0) {
      this._strafeTimer = 0.8 + Math.random() * 0.8;
      this._strafeSign *= -1;
    }

    _toPlayer.subVectors(player.position, this.position);
    _toPlayer.y = 0;
    const dist = _toPlayer.length();
    _toPlayer.normalize();

    const desiredRange = 9;
    const closing = dist > desiredRange + 1.5;
    const retreating = dist < desiredRange - 3;

    _steerDir.set(-_toPlayer.z, 0, _toPlayer.x).multiplyScalar(this._strafeSign);
    if (closing) _steerDir.addScaledVector(_toPlayer, 0.8);
    else if (retreating) _steerDir.addScaledVector(_toPlayer, -0.8);
    _steerDir.normalize();

    const avoided = this._avoidObstacles(arena, _steerDir);
    const speedMult = this._lastSpeedMult ?? 1;
    const speed = MOVEMENT.walkSpeed * speedMult * AI.moveSpeedMult * 0.85;
    this.velocity.x = avoided.x * speed;
    this.velocity.z = avoided.z * speed;

    this._integrateHorizontal(dt, arena);

    // --- Aim: smoothed toward a (sometimes led, always jittered) point ---
    const leadTime = AI.leadPredictionChance > Math.random() ? dist / WEAPON.projectileSpeed : 0;
    _predictedPos.copy(player.position).addScaledVector(player.velocity, leadTime);
    _predictedPos.y += player.eyeHeight * 0.85;

    _eyeA.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    _aimVec.subVectors(_predictedPos, _eyeA);
    const trueDist = _aimVec.length();
    _aimVec.normalize();

    const jitter = (AI.aimJitterBase + AI.aimJitterPerMeter * trueDist) * this.difficulty.aimJitterMult;
    _aimVec.x += (Math.random() - 0.5) * jitter;
    _aimVec.y += (Math.random() - 0.5) * jitter * 0.5;
    _aimVec.z += (Math.random() - 0.5) * jitter;
    _aimVec.normalize();

    const smoothing = 1 - Math.exp(-dt / Math.max(0.05, this.difficulty.reactionDelay));
    this._aimDir.lerp(_aimVec, smoothing).normalize();
    this.yaw = yawFromDirection(this._aimDir.x, this._aimDir.z);

    _fireOrigin.set(this.position.x, this.position.y + this.eyeHeight, this.position.z)
      .addScaledVector(this._aimDir, 0.5);
    this.weapon.fire(this, _fireOrigin, this._aimDir, projectileManager, audioManager, particleManager);
  }

  // NOTE: snapshots wishDir into a private scratch vector before probing, since
  // callers may pass in one of this module's own shared temp vectors (e.g.
  // _steerDir) — mutating that alias mid-loop would corrupt the input.
  _avoidObstacles(arena, wishDir) {
    const probeDist = 2.2;
    _probeOrigin.set(this.position.x, this.position.y + 0.6, this.position.z);
    const obstacleMeshes = this._obstacleMeshes || (this._obstacleMeshes = arena.group.children.filter(
      (m) => m !== arena.floorMesh && m !== arena.platformMesh && m !== arena.rampMesh
    ));

    _wishSnapshot.copy(wishDir);

    _probeRay.set(_probeOrigin, _wishSnapshot);
    _probeRay.far = probeDist;
    _probeRay.near = 0;
    if (_probeRay.intersectObjects(obstacleMeshes, false).length === 0) return _wishSnapshot.clone();

    // Steer around: try deflecting left/right by increasing angles until clear.
    for (const angle of [0.6, -0.6, 1.1, -1.1, 1.6, -1.6]) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      _deflectDir.set(
        _wishSnapshot.x * cos - _wishSnapshot.z * sin,
        0,
        _wishSnapshot.x * sin + _wishSnapshot.z * cos
      );
      _probeRay.set(_probeOrigin, _deflectDir);
      if (_probeRay.intersectObjects(obstacleMeshes, false).length === 0) {
        return _deflectDir.clone().normalize();
      }
    }
    return _wishSnapshot.clone().negate();
  }

  _integrateHorizontal(dt, arena) {
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.resolveObstacleCollisions(arena);
    this.applyVerticalPhysics(dt, arena);
  }

  _checkStuck(dt, arena) {
    this._stuckCheckTimer -= dt;
    if (this._stuckCheckTimer > 0) return;
    this._stuckCheckTimer = 1.0;

    const moved = this.position.distanceTo(this._stuckLastPos);
    this._stuckLastPos.copy(this.position);

    if (moved < 0.5) {
      this.targetPoint = this._findExploreTarget(arena);
      this.state = STATE.EXPLORE;
    }
  }

  /** Replay the entrance animation whenever the enemy respawns. */
  respawn() {
    super.respawn();
    this.playIntro();
  }

  /** Adds the intro rise/pop on top of the base transform sync (cosmetic only). */
  syncMesh(elapsedTime) {
    super.syncMesh(elapsedTime);

    if (this._introTimer > 0) {
      const p = THREE.MathUtils.clamp(1 - this._introTimer / ENEMY_INTRO_DURATION, 0, 1);
      const eased = easeOutBack(p);
      this.mesh.scale.setScalar(THREE.MathUtils.lerp(0.25, 1, eased));
      this.mesh.position.y = this.position.y - (1 - Math.min(1, eased)) * 0.85;
    } else if (this.mesh.scale.x !== 1) {
      this.mesh.scale.setScalar(1);
    }
  }

  /** Only the per-instance materials are ours to free; geometries are shared/cached. */
  dispose() {
    disposeEnemyMaterials(this.materials);
  }
}

export { STATE as AI_STATE };
