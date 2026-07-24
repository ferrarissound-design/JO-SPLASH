import * as THREE from 'three';
import { Character } from './Character.js';
import { MOVEMENT, WEAPON, SUB_WEAPON, SPECIAL, AI, TEAM } from '../config.js';
import { InkBomb } from '../systems/SubWeapon.js';
import { InkBurstSpecial } from '../systems/SpecialWeapon.js';
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
  BOMB: 'bomb',
  SPECIAL: 'special',
  CLIMB: 'climb',
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
const _paintRouteDir = new THREE.Vector3();
const _wallRel = new THREE.Vector3();

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
      id: 'standard',
      label: 'STANDARD',
      reactionDelay: AI.reactionDelaySec,
      aimJitterMult: 1,
      decisionIntervalMult: 1,
      moveSpeedMult: 1,
      bombPressureMult: 1,
      specialChargeMult: 1,
      ...difficulty,
    };

    this.state = STATE.EXPLORE;
    this._decisionTimer = 0;
    this.targetPoint = spawnPoint.clone();
    this._strafeSign = 1;
    this._strafeTimer = 0;
    this.subWeapon = new InkBomb();
    this.special = new InkBurstSpecial(this.team);
    this._weaponSwitchTimer = 0;
    this._debugWeaponLockTimer = 0;
    this._bombDecisionCooldown = 0;
    this._bombPlanTimer = 0;
    this._bombTarget = spawnPoint.clone();
    this.weaponSwitches = 0;
    this.bombsThrown = 0;
    this._specialWindupTimer = 0;
    this._specialDecisionCooldown = 0;
    this.specialsUsed = 0;

    this._aimDir = new THREE.Vector3(0, 0, -1);
    this._aimSmoothT = 0;

    this._stuckCheckTimer = 0;
    this._stuckLastPos = spawnPoint.clone();

    this._recentWaypoints = [];
    this.debugTarget = null; // exposed for debug overlay

    this._climbPlanPanel = null;
    this._climbPlanTimer = 0;
    this._climbPlanCooldown = AI.climbPlanInitialDelaySec + Math.random() * 2;
    this._climbPaintAimIndex = 0;
    this.climbAttempts = 0;
    this.climbsCompleted = 0;
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

  setDifficulty(difficulty = {}) {
    this.difficulty = {
      id: 'standard',
      label: 'STANDARD',
      reactionDelay: AI.reactionDelaySec,
      aimJitterMult: 1,
      decisionIntervalMult: 1,
      moveSpeedMult: 1,
      bombPressureMult: 1,
      specialChargeMult: 1,
      ...difficulty,
    };
    this._decisionTimer = 0;
    return this.difficulty;
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
    const {
      arena, paintSystem, projectileManager, particleManager,
      audioManager, player, ui, onCharacterHit, controlsEnabled,
    } = ctx;

    this.updateTimers(dt);
    this._climbPlanCooldown = Math.max(0, this._climbPlanCooldown - dt);
    this._weaponSwitchTimer = Math.max(0, this._weaponSwitchTimer - dt);
    this._debugWeaponLockTimer = Math.max(0, this._debugWeaponLockTimer - dt);
    this._bombDecisionCooldown = Math.max(0, this._bombDecisionCooldown - dt);
    this._specialDecisionCooldown = Math.max(0, this._specialDecisionCooldown - dt);
    if (this._introTimer > 0) this._introTimer = Math.max(0, this._introTimer - dt);
    if (!this.alive) {
      this._climbPlanPanel = null;
      this._climbPlanTimer = 0;
      this.state = STATE.WAIT_RESPAWN;
      this.syncMesh(ctx.elapsedTime);
      return;
    }
    if (!controlsEnabled) {
      this.syncMesh(ctx.elapsedTime);
      return;
    }

    this.weapon.update(dt);
    this.subWeapon.update(dt);

    this._decisionTimer -= dt;
    if (this._decisionTimer <= 0) {
      this._reevaluate(arena, paintSystem, player, ui);
      this._decisionTimer = THREE.MathUtils.lerp(AI.decisionIntervalMin, AI.decisionIntervalMax, Math.random())
        * this.difficulty.decisionIntervalMult;
    }

    // Travel through own ink in swim form, but surface before attacking so
    // Weapon's shared "cannot fire while submerged" rule stays consistent.
    const wantsInkSurf = this.state !== STATE.ATTACK
      && this.state !== STATE.BOMB
      && this.state !== STATE.SPECIAL
      && this.state !== STATE.CLIMB
      && !this.special.active
      && !this.isClimbing
      && paintSystem.getOwnerAt(this.position.x, this.position.z) === TEAM.CPU;
    const speedMult = this.updateFloorEffects(dt, paintSystem, wantsInkSurf);
    this._lastSpeedMult = speedMult;
    this.updateHealthRegen(dt);

    this._act(dt, arena, paintSystem, projectileManager, particleManager, audioManager, player, ui);
    this.special.update(dt, this, {
      paintSystem,
      particleManager,
      opponent: player,
      onCharacterHit,
    });
    const trailPaintedCells = this.updateFloorParticles(dt, particleManager, paintSystem);
    this.special.addCharge(
      trailPaintedCells * AI.specialChargeMultiplier * this.difficulty.specialChargeMult
    );

    this.syncMesh(ctx.elapsedTime);
  }

  // ---------------------------------------------------------------- decide
  _reevaluate(arena, paintSystem, player, ui) {
    // Once the CPU commits to a wall route it keeps painting/climbing long
    // enough to complete it instead of discarding the plan every 0.25s.
    if (this.isClimbing) return;
    if (this.state === STATE.CLIMB && this._climbPlanPanel && this._climbPlanTimer > 0) return;
    if (this.state === STATE.CLIMB) this._finishClimbPlan(false);
    if (this.state === STATE.BOMB && this._bombPlanTimer > 0) return;
    if (this.state === STATE.SPECIAL && this._specialWindupTimer > 0) return;

    const dist = this.position.distanceTo(player.position);
    const hasLOS = this._hasLineOfSight(arena, player);

    if (this._shouldUseSpecial(paintSystem, player, dist)) {
      this._beginSpecialWindup(ui);
      return;
    }

    if (this.hp < AI.fleeHpThreshold) {
      this.state = STATE.FLEE;
      this.targetPoint = this._findFleeTarget(arena, paintSystem, player);
      return;
    }

    if (this._shouldThrowBomb(player, dist, hasLOS)) {
      this.state = STATE.BOMB;
      this._bombPlanTimer = 0.8;
      this._bombTarget.copy(player.position);
      return;
    }

    if (dist <= AI.attackRange && hasLOS && this.ink >= WEAPON.costPerShot * 2) {
      this._selectCombatWeapon(dist);
      this.state = STATE.ATTACK;
      return;
    }

    if (this.ink < AI.refillInkThreshold) {
      this._selectUtilityWeapon();
      this.state = STATE.REFILL;
      this.targetPoint = this._findOwnTarget(arena, paintSystem);
      return;
    }

    const canPlanClimb = this._climbPlanCooldown <= 0
      && this.position.y < arena.platform.height - 0.35
      && this.ink >= AI.climbMinInk;
    if (canPlanClimb && Math.random() < AI.climbPlanChance && this._beginClimbPlan(arena)) return;

    const survey = this._surveySurroundings(arena, paintSystem);
    if (survey.enemyCount >= survey.sampleCount * 0.4 && survey.enemyPoint) {
      this._selectUtilityWeapon();
      this.state = STATE.RETAKE;
      this.targetPoint = survey.enemyPoint;
      return;
    }

    if (survey.neutralPoint) {
      this._selectUtilityWeapon();
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
    const blockers = this._sightBlockers || (this._sightBlockers = arena.group.children.filter(
      (m) => m !== arena.floorMesh && m !== arena.platformTopMesh && m !== arena.rampTopMesh
    ));
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
  _act(dt, arena, paintSystem, projectileManager, particleManager, audioManager, player, ui) {
    this.debugTarget = this.targetPoint;

    if (this.special.active) {
      this._actSpecialPressure(dt, arena, paintSystem, player);
    } else if (this.state === STATE.SPECIAL) {
      this._actSpecialWindup(dt, arena, audioManager, player, ui);
    } else if (this.state === STATE.CLIMB) {
      this._actClimbPlan(dt, arena, paintSystem, projectileManager, particleManager, audioManager);
    } else if (this.state === STATE.BOMB) {
      this._actBomb(dt, arena, paintSystem, projectileManager, particleManager, audioManager, player);
    } else if (this.state === STATE.ATTACK) {
      this._actAttack(dt, arena, paintSystem, projectileManager, particleManager, audioManager, player);
    } else {
      this._actMoveTo(dt, arena, paintSystem, this.targetPoint);
      if (this.state === STATE.PAINT || this.state === STATE.RETAKE) {
        this._actPaintGround(projectileManager, particleManager, audioManager);
      }
    }
  }

  /** Chooses the closest paintable wall and commits to its outside approach point. */
  _beginClimbPlan(arena) {
    this._selectUtilityWeapon();
    let bestPanel = null;
    let bestTarget = null;
    let bestDistSq = Infinity;

    for (const panel of arena.climbPanels) {
      const target = panel.paint.origin.clone()
        .addScaledVector(panel.paint.tangent, panel.paint.width * 0.5)
        .addScaledVector(panel.normal, -AI.climbApproachOffset);
      target.y = 0;
      const distSq = this.position.distanceToSquared(target);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestPanel = panel;
        bestTarget = target;
      }
    }

    if (!bestPanel) return false;
    this.state = STATE.CLIMB;
    this._climbPlanPanel = bestPanel;
    this._climbPlanTimer = AI.climbPlanDurationSec;
    this._climbPaintAimIndex = 0;
    this.targetPoint.copy(bestTarget);
    this.climbAttempts++;
    return true;
  }

  _selectCombatWeapon(dist) {
    if (this._debugWeaponLockTimer > 0) return false;
    const current = this.weapon.type;
    let desired = 'stream';
    if (current === 'spread' && dist <= AI.spreadWeaponRange + AI.weaponRangeHysteresis) {
      desired = 'spread';
    } else if (current === 'precision' && dist >= AI.precisionWeaponRange - AI.weaponRangeHysteresis) {
      desired = 'precision';
    } else if (dist <= AI.spreadWeaponRange) {
      desired = 'spread';
    } else if (dist >= AI.precisionWeaponRange) {
      desired = 'precision';
    }
    return this._switchWeapon(desired);
  }

  _selectUtilityWeapon() {
    if (this._debugWeaponLockTimer > 0) return false;
    return this._switchWeapon('stream', true);
  }

  _switchWeapon(type, force = false) {
    if (this.weapon.type === type) return false;
    if (!force && this._weaponSwitchTimer > 0) return false;
    if (!this.weapon.setType(type)) return false;
    this._weaponSwitchTimer = AI.weaponSwitchCooldownSec;
    this.weaponSwitches++;
    return true;
  }

  _shouldUseSpecial(paintSystem, player, dist) {
    if (!this.special.ready || this.special.active || this.isClimbing) return false;
    if (this._specialDecisionCooldown > 0 || !player.alive || dist > AI.specialEngageRange) return false;

    const coverage = paintSystem.getCoverage();
    const losingTurf = coverage.playerPct - coverage.cpuPct >= AI.specialCoverageDeficitPct;
    const pressured = dist <= AI.specialCloseRange;
    const lowHp = this.hp <= AI.specialLowHpThreshold;
    return losingTurf || pressured || lowHp;
  }

  _beginSpecialWindup(ui) {
    this.state = STATE.SPECIAL;
    this._specialWindupTimer = AI.specialWindupSec;
    this.inkSurfActive = false;
    this.velocity.x *= 0.25;
    this.velocity.z *= 0.25;
    ui?.showStatusMessage('CPU SPECIAL INCOMING!', AI.specialWindupSec);
  }

  _actSpecialWindup(dt, arena, audioManager, player, ui) {
    this._specialWindupTimer = Math.max(0, this._specialWindupTimer - dt);
    this.velocity.x *= 0.72;
    this.velocity.z *= 0.72;
    this._integrateHorizontal(dt, arena);

    _toPlayer.subVectors(player.position, this.position);
    _toPlayer.y = 0;
    if (_toPlayer.lengthSq() > 0.01) {
      _toPlayer.normalize();
      this.yaw = yawFromDirection(_toPlayer.x, _toPlayer.z);
    }

    if (this._specialWindupTimer > 0) return;
    if (this.special.activate(this, audioManager, null)) {
      this.specialsUsed++;
      this._specialDecisionCooldown = AI.specialDecisionCooldownSec;
      ui?.showStatusMessage('CPU INK BURST!', 1.2);
    }
    this.state = STATE.ATTACK;
  }

  _actSpecialPressure(dt, arena, paintSystem, player) {
    _toPlayer.subVectors(player.position, this.position);
    _toPlayer.y = 0;
    const dist = _toPlayer.length();
    if (dist < 0.01) {
      this.velocity.x *= 0.7;
      this.velocity.z *= 0.7;
      this._integrateHorizontal(dt, arena);
      return;
    }

    _toPlayer.normalize();
    _steerDir.copy(_toPlayer);
    if (dist < SPECIAL.maxRadius * 0.55) {
      _steerDir.set(-_toPlayer.z, 0, _toPlayer.x).multiplyScalar(this._strafeSign);
    }
    const paintAware = this._choosePaintAwareDirection(arena, paintSystem, _steerDir, 0.25);
    const avoided = this._avoidObstacles(arena, paintAware);
    const speed = MOVEMENT.walkSpeed * (this._lastSpeedMult ?? 1)
      * AI.moveSpeedMult * this.difficulty.moveSpeedMult * 0.65;
    this.velocity.x = avoided.x * speed;
    this.velocity.z = avoided.z * speed;
    this.yaw = yawFromDirection(_toPlayer.x, _toPlayer.z);
    this._integrateHorizontal(dt, arena);
  }

  _shouldThrowBomb(player, dist, hasLOS) {
    if (this._bombDecisionCooldown > 0 || this.subWeapon.cooldown > 0) return false;
    if (dist < AI.bombMinRange || dist > AI.bombMaxRange) return false;
    if (this.ink < SUB_WEAPON.cost + AI.bombInkReserve) return false;

    const playerHasHighGround = player.position.y - this.position.y >= AI.bombHighGroundDelta;
    const pressureChance = Math.min(1, AI.bombPressureChance * this.difficulty.bombPressureMult);
    return !hasLOS || playerHasHighGround || Math.random() < pressureChance;
  }

  _actBomb(dt, arena, paintSystem, projectileManager, particleManager, audioManager, player) {
    this._bombPlanTimer -= dt;
    this._bombTarget.lerp(player.position, 0.18);

    // Keep moving while winding up so the throw is readable but not a free hit.
    _toPlayer.subVectors(player.position, this.position);
    _toPlayer.y = 0;
    const dist = _toPlayer.length();
    if (dist > 0.01) {
      _toPlayer.normalize();
      _steerDir.set(-_toPlayer.z, 0, _toPlayer.x).multiplyScalar(this._strafeSign);
      const paintAware = this._choosePaintAwareDirection(arena, paintSystem, _steerDir, 0.35);
      const avoided = this._avoidObstacles(arena, paintAware);
      const speed = MOVEMENT.walkSpeed * (this._lastSpeedMult ?? 1)
        * AI.moveSpeedMult * this.difficulty.moveSpeedMult * 0.55;
      this.velocity.x = avoided.x * speed;
      this.velocity.z = avoided.z * speed;
      this._integrateHorizontal(dt, arena);
    }

    _fireOrigin.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    _predictedPos.copy(this._bombTarget).addScaledVector(player.velocity, 0.22);
    _predictedPos.y += 0.55;
    this._calculateBombDirection(_fireOrigin, _predictedPos, _aimVec);
    this.yaw = yawFromDirection(_aimVec.x, _aimVec.z);
    _fireOrigin.addScaledVector(_aimVec, 0.45);

    if (this.subWeapon.fire(this, _fireOrigin, _aimVec, projectileManager, audioManager, particleManager)) {
      this.bombsThrown++;
      this._bombDecisionCooldown = AI.bombDecisionCooldownSec;
      this.state = dist <= AI.attackRange ? STATE.ATTACK : STATE.EXPLORE;
      return;
    }

    if (this._bombPlanTimer <= 0) {
      this._bombDecisionCooldown = AI.bombDecisionCooldownSec * 0.45;
      this.state = STATE.EXPLORE;
    }
  }

  /**
   * Computes a lob that reaches the target in a bounded time. Direction is
   * intentionally not normalized: ProjectileManager multiplies it by the
   * configured bomb speed, so the components encode the desired launch speed.
   */
  _calculateBombDirection(origin, target, out) {
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const horizontalDist = Math.hypot(dx, dz);
    const flightTime = THREE.MathUtils.clamp(
      horizontalDist / AI.bombHorizontalSpeed,
      AI.bombMinFlightSec,
      SUB_WEAPON.maxLifeSec - 0.15
    );
    const gravity = Math.abs(SUB_WEAPON.gravity);
    const vx = dx / flightTime;
    const vz = dz / flightTime;
    const vy = (target.y - origin.y + 0.5 * gravity * flightTime * flightTime) / flightTime;
    return out.set(
      vx / SUB_WEAPON.projectileSpeed,
      vy / SUB_WEAPON.projectileSpeed,
      vz / SUB_WEAPON.projectileSpeed
    );
  }

  debugThrowBombAt(player) {
    if (!this.alive || this.isClimbing) return false;
    this.inkSurfActive = false;
    this.ink = Math.max(this.ink, SUB_WEAPON.cost);
    this.state = STATE.BOMB;
    this._bombPlanTimer = 0.8;
    this._bombDecisionCooldown = 0;
    this.subWeapon.cooldown = 0;
    this._bombTarget.copy(player.position);
    return true;
  }

  debugCycleWeapon() {
    const types = ['stream', 'spread', 'precision'];
    const next = types[(types.indexOf(this.weapon.type) + 1) % types.length];
    const switched = this._switchWeapon(next, true);
    if (switched) this._debugWeaponLockTimer = 1.2;
    return switched;
  }

  debugStartSpecial(player, ui) {
    if (!this.alive || this.isClimbing || !player.alive) return false;
    this.inkSurfActive = false;
    this.special.active = false;
    this.special.timer = 0;
    this.special.charge = SPECIAL.maxCharge;
    this._specialDecisionCooldown = 0;
    this._beginSpecialWindup(ui);
    return true;
  }

  /**
   * Full CPU traversal loop: walk to the wall, paint a bottom-to-top stripe,
   * then use the same vertical-path gate and ink drain as the player.
   */
  _actClimbPlan(dt, arena, paintSystem, projectileManager, particleManager, audioManager) {
    const panel = this._climbPlanPanel;
    if (!panel) {
      this._finishClimbPlan(false);
      return;
    }

    this._climbPlanTimer -= dt;
    if (this._climbPlanTimer <= 0) {
      this._finishClimbPlan(false);
      return;
    }

    if (this.isClimbing) {
      this._updateCpuClimbing(dt);
      return;
    }

    _wallRel.subVectors(this.position, panel.paint.origin);
    const planeDist = Math.abs(_wallRel.dot(panel.normal));
    const tangentPos = _wallRel.dot(panel.paint.tangent);
    const aligned = tangentPos >= -0.15 && tangentPos <= panel.paint.width + 0.15;
    const inPaintRange = planeDist <= MOVEMENT.capsuleRadius + MOVEMENT.wallClimbApproachDist + 0.3;

    if (!aligned || !inPaintRange) {
      this._actMoveDirectTo(dt, arena, this.targetPoint);
      return;
    }

    this.velocity.x *= 0.45;
    this.velocity.z *= 0.45;
    this._integrateHorizontal(dt, arena);

    if (panel.paint.hasVerticalPath(TEAM.CPU, this.position)) {
      this._startCpuClimb(panel);
      return;
    }

    if (this.ink < this.weapon.profile.costPerShot) {
      this._finishClimbPlan(false);
      return;
    }

    const aimHeights = [0.16, 0.5, 0.84];
    _predictedPos.copy(panel.paint.origin)
      .addScaledVector(panel.paint.tangent, panel.paint.width * 0.5);
    _predictedPos.y = panel.baseY
      + panel.height * aimHeights[this._climbPaintAimIndex % aimHeights.length];
    _eyeA.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    _aimVec.subVectors(_predictedPos, _eyeA).normalize();
    _fireOrigin.copy(_eyeA).addScaledVector(_aimVec, 0.4);
    this.yaw = yawFromDirection(_aimVec.x, _aimVec.z);
    if (this.weapon.fire(this, _fireOrigin, _aimVec, projectileManager, audioManager, particleManager)) {
      this._climbPaintAimIndex++;
    }
  }

  /** Direct final approach so the normal obstacle probe cannot steer around the chosen wall. */
  _actMoveDirectTo(dt, arena, target) {
    _toTarget.set(target.x - this.position.x, 0, target.z - this.position.z);
    const dist = _toTarget.length();
    if (dist < 0.25) {
      this.velocity.x *= 0.5;
      this.velocity.z *= 0.5;
    } else {
      _toTarget.normalize();
      const speed = MOVEMENT.walkSpeed * (this._lastSpeedMult ?? 1)
        * AI.moveSpeedMult * this.difficulty.moveSpeedMult;
      this.velocity.x = _toTarget.x * speed;
      this.velocity.z = _toTarget.z * speed;
      this.yaw = yawFromDirection(_toTarget.x, _toTarget.z);
    }
    this._integrateHorizontal(dt, arena);
  }

  _startCpuClimb(panel) {
    const outside = MOVEMENT.capsuleRadius + 0.02;
    _wallRel.subVectors(this.position, panel.paint.origin);
    const signedDistance = _wallRel.dot(panel.normal);
    this.position.addScaledVector(panel.normal, -outside - signedDistance);
    this.isClimbing = true;
    this._climbPanel = panel;
    this._climbTimer = MOVEMENT.wallClimbMaxDurationSec;
    this.velocity.set(0, MOVEMENT.wallClimbSpeed, 0);
    this.grounded = false;
  }

  _updateCpuClimbing(dt) {
    const panel = this._climbPanel;
    this._climbTimer -= dt;
    this.ink = Math.max(0, this.ink - MOVEMENT.wallClimbInkCostPerSec * dt);
    if (!panel || this.ink <= 0 || this._climbTimer <= 0) {
      this.isClimbing = false;
      this._climbPanel = null;
      this.velocity.y = Math.min(this.velocity.y, 0);
      this._finishClimbPlan(false);
      return;
    }

    this.velocity.set(0, MOVEMENT.wallClimbSpeed, 0);
    this.position.y += MOVEMENT.wallClimbSpeed * dt;
    this.grounded = false;

    if (this.position.y >= panel.topY) {
      this.position.x += panel.normal.x * MOVEMENT.wallClimbMountInward;
      this.position.z += panel.normal.z * MOVEMENT.wallClimbMountInward;
      this.position.y = panel.topY;
      this.velocity.set(panel.normal.x * 2.2, 3, panel.normal.z * 2.2);
      this.grounded = false;
      this.isClimbing = false;
      this._climbPanel = null;
      this.climbsCompleted++;
      this._finishClimbPlan(true);
    }
  }

  _finishClimbPlan(success) {
    this._climbPlanPanel = null;
    this._climbPlanTimer = 0;
    this._climbPaintAimIndex = 0;
    this._climbPlanCooldown = success ? AI.climbPlanCooldownSec : AI.climbPlanCooldownSec * 0.55;
    if (this.state === STATE.CLIMB) {
      this.state = STATE.EXPLORE;
      this.targetPoint.copy(this.position);
      this.targetPoint.y = 0;
    }
  }

  /** Deterministic QA hook, called by Game's debug L key. */
  debugStartClimbPlan(arena) {
    if (!this.alive || this.isClimbing) return false;
    this._finishClimbPlan(false);
    this.ink = Math.max(this.ink, AI.climbMinInk);
    this._climbPlanCooldown = 0;
    return this._beginClimbPlan(arena);
  }

  resetTactics({ newMatch = false } = {}) {
    this._selectUtilityWeapon();
    this.state = STATE.EXPLORE;
    this.targetPoint.copy(this.position);
    this._climbPlanPanel = null;
    this._climbPlanTimer = 0;
    this._climbPlanCooldown = AI.climbPlanInitialDelaySec + Math.random() * 2;
    this._climbPaintAimIndex = 0;
    this.weapon.cooldown = 0;
    this.weapon.recoilTimer = 0;
    this.subWeapon.cooldown = 0;
    this._weaponSwitchTimer = 0;
    this._debugWeaponLockTimer = 0;
    this._bombDecisionCooldown = 1.5;
    this._bombPlanTimer = 0;
    this._specialWindupTimer = 0;
    this._specialDecisionCooldown = 1.5;
    this.special.active = false;
    this.special.timer = 0;
    this.isClimbing = false;
    this._climbPanel = null;
    if (newMatch) {
      this.special.reset();
      this.climbAttempts = 0;
      this.climbsCompleted = 0;
      this.weaponSwitches = 0;
      this.bombsThrown = 0;
      this.specialsUsed = 0;
    }
  }

  get specialWindingUp() {
    return this.state === STATE.SPECIAL && this._specialWindupTimer > 0;
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

  _actMoveTo(dt, arena, paintSystem, target) {
    _toTarget.set(target.x - this.position.x, 0, target.z - this.position.z);
    const dist = _toTarget.length();

    if (dist < 0.6) {
      this.velocity.x *= 0.8;
      this.velocity.z *= 0.8;
      this._integrateHorizontal(dt, arena);
      return;
    }
    _toTarget.normalize();

    const paintAware = this._choosePaintAwareDirection(arena, paintSystem, _toTarget);
    const avoided = this._avoidObstacles(arena, paintAware);
    const speedMult = this._lastSpeedMult ?? 1;
    const speed = MOVEMENT.walkSpeed * speedMult * AI.moveSpeedMult * this.difficulty.moveSpeedMult;

    this.velocity.x = avoided.x * speed;
    this.velocity.z = avoided.z * speed;
    this.yaw = yawFromDirection(avoided.x, avoided.z);

    this._integrateHorizontal(dt, arena);
    this._checkStuck(dt, arena);
  }

  _actAttack(dt, arena, paintSystem, projectileManager, particleManager, audioManager, player) {
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

    this._selectCombatWeapon(dist);
    const desiredRange = this.weapon.type === 'spread' ? 5.5 : this.weapon.type === 'precision' ? 15 : 9;
    const closing = dist > desiredRange + 1.5;
    const retreating = dist < desiredRange - 3;

    _steerDir.set(-_toPlayer.z, 0, _toPlayer.x).multiplyScalar(this._strafeSign);
    if (closing) _steerDir.addScaledVector(_toPlayer, 0.8);
    else if (retreating) _steerDir.addScaledVector(_toPlayer, -0.8);
    _steerDir.normalize();

    const paintAware = this._choosePaintAwareDirection(arena, paintSystem, _steerDir, 0.45);
    const avoided = this._avoidObstacles(arena, paintAware);
    const speedMult = this._lastSpeedMult ?? 1;
    const speed = MOVEMENT.walkSpeed * speedMult
      * AI.moveSpeedMult * this.difficulty.moveSpeedMult * 0.85;
    this.velocity.x = avoided.x * speed;
    this.velocity.z = avoided.z * speed;

    this._integrateHorizontal(dt, arena);

    // --- Aim: smoothed toward a (sometimes led, always jittered) point ---
    const leadTime = AI.leadPredictionChance > Math.random() ? dist / this.weapon.profile.projectileSpeed : 0;
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

  /**
   * Sample several nearby headings and prefer routes already painted by the
   * CPU. Flee/refill states care most; attack strafing uses a lighter weight
   * so combat positioning still wins over perfect ink economy.
   */
  _choosePaintAwareDirection(arena, paintSystem, wishDir, weightMult = 1) {
    const angles = [0, 0.34, -0.34, 0.68, -0.68, 1.05, -1.05];
    let bestScore = -Infinity;
    let bestX = wishDir.x;
    let bestZ = wishDir.z;
    const stateMult = (this.state === STATE.FLEE || this.state === STATE.REFILL) ? 1.55 : 1;

    for (const angle of angles) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const dx = wishDir.x * cos - wishDir.z * sin;
      const dz = wishDir.x * sin + wishDir.z * cos;
      const [px, pz] = arena.clampToBounds(
        this.position.x + dx * AI.routeProbeDist,
        this.position.z + dz * AI.routeProbeDist,
        1
      );
      const owner = paintSystem.getOwnerAt(px, pz);
      let inkScore = 0;
      if (owner === TEAM.CPU) inkScore = AI.ownInkRouteBonus;
      else if (owner === TEAM.PLAYER) inkScore = -AI.enemyInkRoutePenalty;

      const progress = dx * wishDir.x + dz * wishDir.z;
      const turnPenalty = Math.abs(angle) * 0.16;
      const score = progress * 1.8 + inkScore * weightMult * stateMult - turnPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestX = dx;
        bestZ = dz;
      }
    }

    return _paintRouteDir.set(bestX, 0, bestZ).normalize();
  }

  // NOTE: snapshots wishDir into a private scratch vector before probing, since
  // callers may pass in one of this module's own shared temp vectors (e.g.
  // _steerDir) — mutating that alias mid-loop would corrupt the input.
  _avoidObstacles(arena, wishDir) {
    const probeDist = 2.2;
    _probeOrigin.set(this.position.x, this.position.y + 0.6, this.position.z);
    const obstacleMeshes = this._obstacleMeshes || (this._obstacleMeshes = arena.group.children.filter(
      (m) => m !== arena.floorMesh && m !== arena.platformMesh && m !== arena.rampMesh
        && m !== arena.platformTopMesh && m !== arena.rampTopMesh
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

  die() {
    super.die();
    this.special.active = false;
    this.special.timer = 0;
    this.special.charge *= 0.5;
    this._specialWindupTimer = 0;
  }

  /** Replay the entrance animation whenever the enemy respawns. */
  respawn() {
    super.respawn();
    this.resetTactics();
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
