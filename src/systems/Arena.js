import * as THREE from 'three';
import { ARENA, COLORS } from '../config.js';

// ============================================================================
// Arena — builds the single starter stage: a rectangular floor, a raised
// central platform reached by an off-center ramp, scattered obstacles, and
// perimeter walls that double as the fall-off boundary.
//
// Exposes lightweight collision data (AABBs / cylinders) consumed by
// Player, EnemyAI and ProjectileManager, plus a `getGroundHeight` query used
// for platform/ramp foot placement. No physics engine — geometry is simple
// enough that hand-rolled checks stay cheap and predictable.
// ============================================================================

export class Arena {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Arena';

    this.halfWidth = ARENA.width / 2;
    this.halfDepth = ARENA.depth / 2;

    /** @type {{min: THREE.Vector2, max: THREE.Vector2, height:number}[]} box colliders (XZ footprint) */
    this.boxColliders = [];
    /** @type {{center: THREE.Vector2, radius:number, height:number}[]} */
    this.cylinderColliders = [];

    this._buildFloor();
    this._buildPlatformAndRamp();
    this._buildObstacles();
    this._buildWalls();

    // Kept well clear of the boundary walls (not just inside them) so the
    // TPS camera's collision pull-in has room to sit at its normal distance
    // right from the spawn, rather than clipping in tight from frame one.
    this.spawnPoints = {
      player: new THREE.Vector3(-13, 0, 12.5),
      cpu: new THREE.Vector3(13.5, 0, -13),
    };
  }

  // Floor mesh uses an explicit quad (rather than a rotated PlaneGeometry) so
  // the UV <-> world mapping is unambiguous: u=0..1 maps to x=-hw..hw and
  // v=0..1 maps to z=-hd..hd, matching PaintSystem's canvas coordinates 1:1.
  // PaintSystem assigns its CanvasTexture onto this mesh's material.
  _buildFloor() {
    const hw = this.halfWidth;
    const hd = this.halfDepth;

    const positions = new Float32Array([
      -hw, 0, -hd,
       hw, 0, -hd,
       hw, 0,  hd,
      -hw, 0,  hd,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const indices = [0, 2, 1, 0, 3, 2];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.floorBase,
      roughness: 0.92,
      metalness: 0.02,
    });
    this.floorMesh = new THREE.Mesh(geo, mat);
    this.floorMesh.receiveShadow = false;
    this.floorMesh.name = 'floor';
    this.group.add(this.floorMesh);
  }

  _buildPlatformAndRamp() {
    const size = ARENA.platformSize;
    const h = ARENA.platformHeight;

    const platGeo = new THREE.BoxGeometry(size, h, size);
    const platMat = new THREE.MeshStandardMaterial({ color: COLORS.platform, roughness: 0.85 });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(0, h / 2, 0);
    this.group.add(platform);
    this.platformMesh = platform;

    this.platform = {
      min: new THREE.Vector2(-size / 2, -size / 2),
      max: new THREE.Vector2(size / 2, size / 2),
      height: h,
    };

    // Ramp offset from center along X so the climb isn't perfectly symmetric.
    const rampWidth = ARENA.rampWidth;
    const rampLen = ARENA.rampLength;
    const rampOffsetX = 2.2;
    const rampCenterZ = size / 2 + rampLen / 2;
    const rampAngle = Math.atan2(h, rampLen);

    const rampGeo = new THREE.BoxGeometry(rampWidth, 0.4, rampLen / Math.cos(rampAngle));
    const rampMat = new THREE.MeshStandardMaterial({ color: COLORS.ramp, roughness: 0.88 });
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.position.set(rampOffsetX, h / 2, rampCenterZ);
    ramp.rotation.x = -rampAngle;
    this.group.add(ramp);
    this.rampMesh = ramp;

    this.ramp = {
      minX: rampOffsetX - rampWidth / 2,
      maxX: rampOffsetX + rampWidth / 2,
      minZ: size / 2,
      maxZ: size / 2 + rampLen,
      height: h,
      length: rampLen,
    };
  }

  _buildObstacles() {
    const defs = [
      { type: 'box', pos: [-9, 1, 6], size: [2.4, 2, 2.4] },
      { type: 'box', pos: [9.5, 1, -3.5], size: [2.2, 2, 3] },
      { type: 'cylinder', pos: [-6.5, 1.1, -10], radius: 1.4, height: 2.2 },
      { type: 'cylinder', pos: [7.5, 1, 12.5], radius: 1.6, height: 2 },
      { type: 'box', pos: [13.5, 1, 2.5], size: [2, 2, 4] },
      { type: 'box', pos: [-13.5, 1, -8], size: [3, 2, 2] },
      { type: 'cylinder', pos: [2, 1, -15], radius: 1.3, height: 2 },
    ];

    const mat = new THREE.MeshStandardMaterial({ color: COLORS.obstacle, roughness: 0.8 });

    for (const def of defs) {
      if (def.type === 'box') {
        const [sx, sy, sz] = def.size;
        const geo = new THREE.BoxGeometry(sx, sy, sz);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
        this.group.add(mesh);
        this.boxColliders.push({
          min: new THREE.Vector2(def.pos[0] - sx / 2, def.pos[2] - sz / 2),
          max: new THREE.Vector2(def.pos[0] + sx / 2, def.pos[2] + sz / 2),
          height: sy,
        });
      } else {
        const geo = new THREE.CylinderGeometry(def.radius, def.radius, def.height, 16);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
        this.group.add(mesh);
        this.cylinderColliders.push({
          center: new THREE.Vector2(def.pos[0], def.pos[2]),
          radius: def.radius,
          height: def.height,
        });
      }
    }
  }

  _buildWalls() {
    const wallH = ARENA.wallHeight;
    const t = 1;
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.7 });
    const w = ARENA.width;
    const d = ARENA.depth;

    const specs = [
      { pos: [0, wallH / 2, d / 2 + t / 2], size: [w + t * 2, wallH, t] },
      { pos: [0, wallH / 2, -d / 2 - t / 2], size: [w + t * 2, wallH, t] },
      { pos: [w / 2 + t / 2, wallH / 2, 0], size: [t, wallH, d] },
      { pos: [-w / 2 - t / 2, wallH / 2, 0], size: [t, wallH, d] },
    ];

    for (const s of specs) {
      const geo = new THREE.BoxGeometry(...s.size);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...s.pos);
      this.group.add(mesh);
      const [sx, , sz] = s.size;
      this.boxColliders.push({
        min: new THREE.Vector2(s.pos[0] - sx / 2, s.pos[2] - sz / 2),
        max: new THREE.Vector2(s.pos[0] + sx / 2, s.pos[2] + sz / 2),
        height: wallH,
      });
    }
  }

  /** Ground height (y) at a given XZ, accounting for platform + ramp. Does not include obstacles. */
  getGroundHeight(x, z) {
    const p = this.platform;
    if (x >= p.min.x && x <= p.max.x && z >= p.min.y && z <= p.max.y) {
      return p.height;
    }
    const r = this.ramp;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
      const t = (z - r.minZ) / r.length; // 0 at floor edge, 1 at platform edge
      return THREE.MathUtils.clamp(t, 0, 1) * r.height;
    }
    return 0;
  }

  /** Clamp a horizontal position to remain within the playable floor (inside the walls). */
  clampToBounds(x, z, margin = 0.5) {
    const hw = this.halfWidth - margin;
    const hd = this.halfDepth - margin;
    return [THREE.MathUtils.clamp(x, -hw, hw), THREE.MathUtils.clamp(z, -hd, hd)];
  }
}
