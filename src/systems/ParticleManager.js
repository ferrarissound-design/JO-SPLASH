import * as THREE from 'three';
import { PARTICLES } from '../config.js';

// ============================================================================
// ParticleManager — fixed-size pool of small billboard-ish sphere meshes
// shared by every visual effect (muzzle flash, ink splats, KO explosions,
// ink-surf trail). Nothing is created or destroyed during play; particles
// are recycled from the pool and guaranteed to be reclaimed once their
// lifetime elapses, so long sessions never accumulate objects.
// ============================================================================
export class ParticleManager {
  constructor(scene) {
    this.scene = scene;
    this._geo = new THREE.SphereGeometry(1, 6, 5);

    this.pool = [];
    for (let i = 0; i < PARTICLES.poolSize; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(this._geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        mat,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        gravity: 0,
        baseScale: 0.1,
        active: false,
      });
    }
    this._cursor = 0;
  }

  _acquire() {
    // Round-robin allocation: cheap, and naturally reuses the longest-idle
    // slot first if the pool is ever fully saturated.
    for (let i = 0; i < this.pool.length; i++) {
      const idx = (this._cursor + i) % this.pool.length;
      if (!this.pool[idx].active) {
        this._cursor = (idx + 1) % this.pool.length;
        return this.pool[idx];
      }
    }
    return null;
  }

  _spawnOne(position, color, opts) {
    const p = this._acquire();
    if (!p) return;
    const {
      velocity = new THREE.Vector3(),
      life = 0.4,
      gravity = 0,
      scale = 0.12,
      opacity = 1,
    } = opts;

    p.active = true;
    p.life = life;
    p.maxLife = life;
    p.gravity = gravity;
    p.baseScale = scale;
    p.velocity.copy(velocity);
    p.mesh.position.copy(position);
    p.mesh.scale.setScalar(scale);
    p.mat.color.setHex(color);
    p.mat.opacity = opacity;
    p.mesh.visible = true;
  }

  spawnMuzzle(position, color) {
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5);
      this._spawnOne(position, color, { velocity: v, life: 0.15, scale: 0.06 + Math.random() * 0.04 });
    }
  }

  spawnSplat(position, color, big = false) {
    const count = big ? PARTICLES.splatCount : Math.ceil(PARTICLES.splatCount * 0.5);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2.5;
      const v = new THREE.Vector3(Math.cos(angle) * speed, Math.random() * 2.2, Math.sin(angle) * speed);
      this._spawnOne(position, color, {
        velocity: v,
        life: PARTICLES.splatLifeSec * (0.7 + Math.random() * 0.6),
        gravity: -9,
        scale: 0.05 + Math.random() * 0.08,
      });
    }
  }

  spawnInkLineSpray(position, color, chargeRatio = 0) {
    const ratio = Math.max(0, Math.min(1, chargeRatio));
    const count = ratio >= 0.8 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * (0.7 + ratio),
        0.35 + Math.random() * (0.65 + ratio * 0.55),
        (Math.random() - 0.5) * (0.7 + ratio),
      );
      this._spawnOne(position, color, {
        velocity: v,
        life: 0.18 + ratio * 0.18,
        gravity: -6,
        scale: 0.035 + Math.random() * (0.035 + ratio * 0.025),
        opacity: 0.68,
      });
    }
  }

  spawnChargedImpact(position, color, chargeRatio = 0) {
    const ratio = Math.max(0, Math.min(1, chargeRatio));
    const count = Math.ceil(PARTICLES.splatCount * (0.65 + ratio * 0.7));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * (2.8 + ratio * 2.4);
      const v = new THREE.Vector3(
        Math.cos(angle) * speed,
        0.5 + Math.random() * (2.2 + ratio * 1.6),
        Math.sin(angle) * speed,
      );
      this._spawnOne(position, color, {
        velocity: v,
        life: PARTICLES.splatLifeSec * (0.8 + ratio * 0.65),
        gravity: -9.5,
        scale: 0.055 + Math.random() * (0.075 + ratio * 0.07),
      });
    }
  }

  spawnKOExplosion(position, color) {
    for (let i = 0; i < PARTICLES.koCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      const v = new THREE.Vector3(Math.cos(angle) * speed, 1 + Math.random() * 4, Math.sin(angle) * speed);
      this._spawnOne(position, color, {
        velocity: v,
        life: PARTICLES.koLifeSec * (0.6 + Math.random() * 0.7),
        gravity: -12,
        scale: 0.08 + Math.random() * 0.14,
      });
    }
  }

  spawnInkSurfTrail(position, color) {
    for (let i = 0; i < PARTICLES.trailCount; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
      this._spawnOne(position, color, {
        velocity: v,
        life: PARTICLES.trailLifeSec,
        gravity: -4,
        scale: 0.04 + Math.random() * 0.05,
        opacity: 0.7,
      });
    }
  }

  spawnEnemyFloorSpray(position, color) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4);
    this._spawnOne(position, color, { velocity: v, life: 0.3, gravity: -6, scale: 0.05, opacity: 0.6 });
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.velocity.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      const t = p.life / p.maxLife;
      p.mat.opacity = t;
      p.mesh.scale.setScalar(p.baseScale * (0.6 + 0.4 * t));
    }
  }

  reset() {
    for (const p of this.pool) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  dispose() {
    for (const p of this.pool) {
      this.scene.remove(p.mesh);
      p.mat.dispose();
    }
    this._geo.dispose();
  }
}
