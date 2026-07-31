import * as THREE from 'three';
import { COLORS, TEAM } from '../config.js';

export const GADGET_BALANCE = Object.freeze({
  mine: Object.freeze({ lifeSec: 12, armSec: 0.65, triggerRadius: 2.15, damage: 38, paintRadius: 3.5 }),
  wall: Object.freeze({ lifeSec: 5.5, width: 4.2, height: 2.4 }),
});

export class GadgetSystem {
  constructor(scene, arena, paintSystem, particleManager, audioManager, onCharacterHit) {
    this.scene = scene;
    this.arena = arena;
    this.paintSystem = paintSystem;
    this.particleManager = particleManager;
    this.audioManager = audioManager;
    this.onCharacterHit = onCharacterHit;
    this.projectileManager = null;
    this.mines = [];
    this.walls = [];
  }

  attachProjectileManager(projectileManager) {
    this.projectileManager = projectileManager;
  }

  deployMine(character) {
    const color = character.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.62, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: 0x10182c, emissive: color, emissiveIntensity: 0.5 }),
    );
    const light = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.065, 6, 16),
      new THREE.MeshBasicMaterial({ color }),
    );
    light.rotation.x = Math.PI / 2;
    light.position.y = 0.12;
    group.add(base, light);
    group.position.set(character.position.x, this.arena.getGroundHeight(character.position.x, character.position.z) + 0.08, character.position.z);
    this.scene.add(group);
    this.mines.push({ group, light, team: character.team, life: GADGET_BALANCE.mine.lifeSec, age: 0, phase: 0 });
    return true;
  }

  deployWall(character, direction) {
    const dir = direction.clone().setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const center = character.position.clone().addScaledVector(dir, 2.4);
    center.y = this.arena.getGroundHeight(center.x, center.z) + 1.2;
    const color = character.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(GADGET_BALANCE.wall.width, GADGET_BALANCE.wall.height, 0.28),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.72,
        roughness: 0.32,
      }),
    );
    mesh.position.copy(center);
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(mesh);
    this.projectileManager?.arenaMeshes.push(mesh);

    const halfWidth = GADGET_BALANCE.wall.width / 2;
    const halfX = Math.abs(right.x) * halfWidth + Math.abs(dir.x) * 0.22;
    const halfZ = Math.abs(right.z) * halfWidth + Math.abs(dir.z) * 0.22;
    const collider = {
      min: new THREE.Vector2(center.x - halfX, center.z - halfZ),
      max: new THREE.Vector2(center.x + halfX, center.z + halfZ),
      height: center.y + 1.2,
    };
    this.arena.boxColliders.push(collider);
    this.walls.push({ mesh, collider, life: GADGET_BALANCE.wall.lifeSec });
    return true;
  }

  update(dt, targets) {
    for (const mine of [...this.mines]) {
      mine.life -= dt;
      mine.age += dt;
      mine.phase += dt;
      const armed = mine.age >= GADGET_BALANCE.mine.armSec;
      mine.light.material.color.setHex(armed ? (mine.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu) : 0xfff27a);
      mine.light.scale.setScalar(1 + Math.sin(mine.phase * (armed ? 8 : 4)) * (armed ? 0.12 : 0.05));
      const target = armed ? targets.find((candidate) => candidate.alive && candidate.team !== mine.team
        && candidate.position.distanceToSquared(mine.group.position) <= GADGET_BALANCE.mine.triggerRadius ** 2) : null;
      if (target) {
        const point = mine.group.position.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.onCharacterHit?.(target.team, GADGET_BALANCE.mine.damage, point, { attackerTeam: mine.team });
        const changed = this.paintSystem.paintSplat(point.x, point.z, GADGET_BALANCE.mine.paintRadius, mine.team);
        this.projectileManager?.onPaint?.(mine.team, changed);
        this.particleManager?.spawnKOExplosion(point, mine.team === TEAM.PLAYER ? COLORS.player : COLORS.cpu);
        this.audioManager?.playImpact();
        mine.life = 0;
      }
      if (mine.life <= 0) this._removeMine(mine);
    }

    for (const wall of [...this.walls]) {
      wall.life -= dt;
      wall.mesh.material.opacity = Math.min(0.72, wall.life * 0.7);
      if (wall.life <= 0) this._removeWall(wall);
    }
  }

  _removeMine(mine) {
    this.mines.splice(this.mines.indexOf(mine), 1);
    this.scene.remove(mine.group);
    mine.group.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
  }

  _removeWall(wall) {
    this.walls.splice(this.walls.indexOf(wall), 1);
    this.scene.remove(wall.mesh);
    const meshIndex = this.projectileManager?.arenaMeshes.indexOf(wall.mesh) ?? -1;
    if (meshIndex >= 0) this.projectileManager.arenaMeshes.splice(meshIndex, 1);
    const colliderIndex = this.arena.boxColliders.indexOf(wall.collider);
    if (colliderIndex >= 0) this.arena.boxColliders.splice(colliderIndex, 1);
    wall.mesh.geometry.dispose();
    wall.mesh.material.dispose();
  }

  reset() {
    for (const mine of [...this.mines]) this._removeMine(mine);
    for (const wall of [...this.walls]) this._removeWall(wall);
  }
}
