import * as THREE from 'three';
import { WEAPON, PROJECTILE_POOL, PAINT, MOVEMENT, TEAM } from '../config.js';

const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _closestOnSeg = new THREE.Vector3();
const _raySegDir = new THREE.Vector3();
const _paintSample = new THREE.Vector3();
const _paintRayOrigin = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _raycaster = new THREE.Raycaster();

/** Closest squared distance between a moving point's swept segment (a0->a1) and a
 *  vertical character segment (b0->b1, feet to head). Returns { distSq, point }. */
function closestDistSqSegmentToSegment(a0, a1, b0, b1) {
  const d1x = a1.x - a0.x, d1y = a1.y - a0.y, d1z = a1.z - a0.z;
  const d2x = b1.x - b0.x, d2y = b1.y - b0.y, d2z = b1.z - b0.z;
  const rx = a0.x - b0.x, ry = a0.y - b0.y, rz = a0.z - b0.z;

  const A = d1x * d1x + d1y * d1y + d1z * d1z;
  const E = d2x * d2x + d2y * d2y + d2z * d2z;
  const F = d2x * rx + d2y * ry + d2z * rz;

  let s, t;
  if (A <= 1e-8 && E <= 1e-8) {
    s = 0; t = 0;
  } else if (A <= 1e-8) {
    s = 0; t = THREE.MathUtils.clamp(F / E, 0, 1);
  } else {
    const C = d1x * rx + d1y * ry + d1z * rz;
    if (E <= 1e-8) {
      t = 0; s = THREE.MathUtils.clamp(-C / A, 0, 1);
    } else {
      const B = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = A * E - B * B;
      s = denom !== 0 ? THREE.MathUtils.clamp((B * F - C * E) / denom, 0, 1) : 0;
      t = (B * s + F) / E;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-C / A, 0, 1); }
      else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((B - C) / A, 0, 1); }
    }
  }

  const cax = a0.x + d1x * s, cay = a0.y + d1y * s, caz = a0.z + d1z * s;
  const cbx = b0.x + d2x * t, cby = b0.y + d2y * t, cbz = b0.z + d2z * t;
  const dx = cax - cbx, dy = cay - cby, dz = caz - cbz;
  _closestOnSeg.set(cax, cay, caz);
  return dx * dx + dy * dy + dz * dz;
}

// ============================================================================
// ProjectileManager — object pool for the ink shooter's projectiles.
// Each active projectile is swept from its previous to current position each
// frame: first tested against the (single) opposing character, then against
// static arena geometry. Floor hits paint the surface; every other surface
// only spawns a splash. Pool entries are reused, never reallocated.
// ============================================================================
export class ProjectileManager {
  constructor(scene, arena, paintSystem, particleManager, audioManager) {
    this.scene = scene;
    this.arena = arena;
    this.paintSystem = paintSystem;
    this.particleManager = particleManager;
    this.audioManager = audioManager;

    this.arenaMeshes = arena.group.children.slice();

    this._headGeo = new THREE.SphereGeometry(WEAPON.projectileRadius, 8, 6);
    this._tailGeo = new THREE.ConeGeometry(WEAPON.projectileRadius * 0.7, 0.5, 6);

    this.pool = [];
    for (let i = 0; i < PROJECTILE_POOL.size; i++) {
      this.pool.push(this._createSlot());
    }

    this.onCharacterHit = null; // (targetTeam, damage, hitPoint) => void, set by Game
    this.onPaint = null; // (team, changedCells) => void, set by Game
    this.chargeLinesFired = 0;
    this.chargeLinePaintedCells = 0;
    this.chargeWallStrokes = 0;
  }

  _createSlot() {
    const group = new THREE.Group();
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    const head = new THREE.Mesh(this._headGeo, headMat);
    const tail = new THREE.Mesh(this._tailGeo, tailMat);
    tail.position.z = 0.3;
    tail.rotation.x = Math.PI / 2;
    group.add(head, tail);
    group.visible = false;
    this.scene.add(group);

    return {
      group, headMat, tailMat,
      position: new THREE.Vector3(),
      prevPosition: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      team: null,
      life: 0,
      distance: 0,
      damage: WEAPON.damage,
      hitRadius: WEAPON.projectileRadius,
      paintRadius: PAINT.splatRadius,
      maxRange: WEAPON.maxRange,
      maxLifeSec: WEAPON.maxLifeSec,
      gravity: 0,
      speed: WEAPON.projectileSpeed,
      chargeRatio: 0,
      paintLineRadius: 0,
      paintLineSpacing: 0,
      paintLineDrop: 0,
      wallPaintLength: 0,
      nextLinePaintDistance: 0,
      linePaintedCells: 0,
      active: false,
    };
  }

  spawn(origin, direction, team, profile = WEAPON) {
    const slot = this.pool.find((s) => !s.active);
    if (!slot) return false; // pool exhausted; drop the shot rather than allocate

    slot.position.copy(origin);
    slot.prevPosition.copy(origin);
    slot.velocity.copy(direction).multiplyScalar(profile.projectileSpeed);
    slot.team = team;
    slot.life = 0;
    slot.distance = 0;
    slot.damage = profile.damage;
    slot.hitRadius = profile.projectileRadius;
    slot.paintRadius = profile.paintRadius ?? PAINT.splatRadius;
    slot.maxRange = profile.maxRange;
    slot.maxLifeSec = profile.maxLifeSec;
    slot.gravity = profile.gravity ?? 0;
    slot.speed = profile.projectileSpeed;
    slot.chargeRatio = profile.chargeRatio ?? 0;
    slot.paintLineRadius = profile.paintLineRadius ?? 0;
    slot.paintLineSpacing = profile.paintLineSpacing ?? 0;
    slot.paintLineDrop = profile.paintLineDrop ?? 0;
    slot.wallPaintLength = profile.wallPaintLength ?? 0;
    slot.nextLinePaintDistance = Math.max(0.9, slot.paintLineSpacing);
    slot.linePaintedCells = 0;
    slot.active = true;
    if (slot.paintLineRadius > 0) this.chargeLinesFired++;

    const color = team === TEAM.PLAYER ? 0x2fb8ff : 0xff7a2f;
    slot.headMat.color.setHex(color);
    slot.tailMat.color.setHex(color);

    slot.group.position.copy(origin);
    slot.group.scale.setScalar(profile.projectileRadius / WEAPON.projectileRadius);
    slot.group.visible = true;
    if (direction.lengthSq() > 1e-6) {
      _raySegDir.copy(direction).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), _raySegDir);
      slot.group.quaternion.copy(quat);
    }
    return true;
  }

  /** targets: array of alive-or-dead Character instances (player, cpu). */
  update(dt, targets) {
    for (const slot of this.pool) {
      if (!slot.active) continue;

      slot.prevPosition.copy(slot.position);
      slot.velocity.y += slot.gravity * dt;
      slot.position.addScaledVector(slot.velocity, dt);
      slot.life += dt;
      slot.distance += slot.speed * dt;

      if (slot.paintLineRadius > 0) this._paintChargedLine(slot);

      if (slot.life >= slot.maxLifeSec || slot.distance >= slot.maxRange) {
        this._deactivate(slot);
        continue;
      }

      if (this._checkCharacterHit(slot, targets)) continue;
      if (this._checkTerrainHit(slot)) continue;

      slot.group.position.copy(slot.position);
    }
  }

  _paintChargedLine(slot) {
    const segmentLength = slot.position.distanceTo(slot.prevPosition);
    if (segmentLength <= 1e-6 || slot.paintLineSpacing <= 0) return;

    const segmentStartDistance = Math.max(0, slot.distance - segmentLength);
    const color = slot.team === TEAM.PLAYER ? 0x2fb8ff : 0xff7a2f;
    const paintThroughDistance = Math.min(slot.distance, slot.maxRange);
    while (slot.nextLinePaintDistance <= paintThroughDistance) {
      const stampIndex = Math.floor(slot.nextLinePaintDistance / slot.paintLineSpacing);
      const t = THREE.MathUtils.clamp(
        (slot.nextLinePaintDistance - segmentStartDistance) / segmentLength,
        0,
        1,
      );
      _paintSample.lerpVectors(slot.prevPosition, slot.position, t);
      _paintRayOrigin.copy(_paintSample);

      _raycaster.set(_paintRayOrigin, _down);
      _raycaster.near = 0;
      _raycaster.far = slot.paintLineDrop;
      const hits = _raycaster.intersectObjects(this.arenaMeshes, false);
      if (hits.length > 0 && this.arena.paintableFloorMeshes.has(hits[0].object)) {
        const floorHit = hits[0];
        const paintedCells = this.paintSystem.paintSplat(
          floorHit.point.x,
          floorHit.point.z,
          slot.paintLineRadius,
          slot.team,
          {
            dirX: slot.velocity.x,
            dirZ: slot.velocity.z,
            stretch: 1.18,
            minorScale: 0.78,
            splatterScale: 0.08 + slot.chargeRatio * 0.08,
            glossScale: 0.34 + slot.chargeRatio * 0.18,
            skipGloss: stampIndex % 3 !== 0,
          },
        );
        slot.linePaintedCells += paintedCells;
        this.chargeLinePaintedCells += paintedCells;
        this.onPaint?.(slot.team, paintedCells);
        if (paintedCells > 0 && stampIndex % 3 === 0) {
          this.particleManager?.spawnInkLineSpray(floorHit.point, color, slot.chargeRatio);
        }
      }
      slot.nextLinePaintDistance += slot.paintLineSpacing;
    }
  }

  _checkCharacterHit(slot, targets) {
    for (const target of targets) {
      if (target.team === slot.team || !target.alive || target.invincibleTimer > 0) continue;

      _p1.set(target.position.x, target.position.y, target.position.z);
      _p2.set(target.position.x, target.position.y + target.hitboxHeight, target.position.z);
      const hitRadius = MOVEMENT.capsuleRadius + slot.hitRadius;

      const distSq = closestDistSqSegmentToSegment(slot.prevPosition, slot.position, _p1, _p2);
      if (distSq <= hitRadius * hitRadius) {
        const hitPoint = _closestOnSeg.clone();
        // Game's onCharacterHit callback plays the damage sound; nothing further needed here.
        this.onCharacterHit?.(target.team, slot.damage, hitPoint);
        const color = slot.team === TEAM.PLAYER ? 0x2fb8ff : 0xff7a2f;
        if (slot.chargeRatio > 0) {
          this.particleManager?.spawnChargedImpact(hitPoint, color, slot.chargeRatio);
        } else {
          this.particleManager?.spawnSplat(hitPoint, color);
        }
        this._deactivate(slot);
        return true;
      }
    }
    return false;
  }

  _checkTerrainHit(slot) {
    _raySegDir.subVectors(slot.position, slot.prevPosition);
    const segLen = _raySegDir.length();
    if (segLen < 1e-6) return false;
    _raySegDir.normalize();

    _raycaster.set(slot.prevPosition, _raySegDir);
    _raycaster.far = segLen;
    _raycaster.near = 0;

    const hits = _raycaster.intersectObjects(this.arenaMeshes, false);
    if (hits.length === 0) return false;

    const hit = hits[0];
    const color = slot.team === TEAM.PLAYER ? 0x2fb8ff : 0xff7a2f;
    const climbPanel = this.arena.climbPanelByMesh.get(hit.object);

    if (this.arena.paintableFloorMeshes.has(hit.object)) {
      const paintedCells = this.paintSystem.paintSplat(hit.point.x, hit.point.z, slot.paintRadius, slot.team, {
        dirX: slot.velocity.x,
        dirZ: slot.velocity.z,
        stretch: 1.45,
      });
      this.onPaint?.(slot.team, paintedCells);
      if (slot.chargeRatio > 0) {
        this.particleManager?.spawnChargedImpact(hit.point, color, slot.chargeRatio);
      } else {
        this.particleManager?.spawnSplat(hit.point, color, true);
      }
    } else if (climbPanel) {
      let wallPaintedCells = 0;
      if (slot.wallPaintLength > 0) {
        wallPaintedCells = climbPanel.paint.paintStroke(
          hit.point,
          slot.velocity,
          slot.wallPaintLength,
          Math.max(slot.paintLineRadius, slot.paintRadius * 0.42),
          slot.team,
        );
        this.chargeWallStrokes++;
        this.particleManager?.spawnChargedImpact(hit.point, color, slot.chargeRatio);
      } else {
        wallPaintedCells = climbPanel.paint.paintSplat(hit.point, slot.paintRadius, slot.team);
        this.particleManager?.spawnSplat(hit.point, color, true);
      }
      // Wall panels aren't part of match coverage scoring, but painting one is
      // real productive work (it's how climb routes get opened) — feed it into
      // the special gauge the same way floor painting does.
      this.onPaint?.(slot.team, wallPaintedCells);
    } else {
      this.particleManager?.spawnSplat(hit.point, color, false);
    }
    this.audioManager?.playImpact();

    this._deactivate(slot);
    return true;
  }

  _deactivate(slot) {
    slot.active = false;
    slot.group.visible = false;
  }

  reset() {
    for (const slot of this.pool) this._deactivate(slot);
    this.chargeLinesFired = 0;
    this.chargeLinePaintedCells = 0;
    this.chargeWallStrokes = 0;
  }

  dispose() {
    for (const slot of this.pool) {
      this.scene.remove(slot.group);
      slot.headMat.dispose();
      slot.tailMat.dispose();
    }
    this._headGeo.dispose();
    this._tailGeo.dispose();
  }
}
