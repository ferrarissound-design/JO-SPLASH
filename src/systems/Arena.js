import * as THREE from 'three';
import { ARENA, COLORS } from '../config.js';
import { WallPanel } from './WallPanel.js';

const _up = new THREE.Vector3(0, 1, 0);

// ============================================================================
// Arena — builds the single starter stage: a rectangular floor, a raised
// central platform reached by an off-center ramp and two paintable climb
// panels, scattered obstacles, and perimeter walls that double as the
// fall-off boundary.
//
// Exposes lightweight collision data (AABBs / cylinders) consumed by
// Player, EnemyAI and ProjectileManager, plus a `getGroundHeight` query used
// for platform/ramp foot placement. No physics engine — geometry is simple
// enough that hand-rolled checks stay cheap and predictable.
//
// Paintability: the floor, the platform's top face and the ramp's surface
// all share PaintSystem's single world-space grid/texture (mapped straight
// from world XZ, same as the floor), so painting any of them is a plain
// paintSystem.paintSplat(x, z, ...) call — no special-casing needed outside
// of recognizing which mesh a projectile hit. The two climb panels are a
// different, much smaller surface (vertical, independent of XZ) and carry
// their own WallPanel paint grid instead.
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
    /** @type {ReturnType<Arena['_buildClimbPanel']>[]} paintable/climbable wall sections */
    this.climbPanels = [];
    this.climbPanelByMesh = new Map();

    this._buildFloor();
    this._buildPlatformAndRamp();
    this._buildObstacles();
    this._buildWalls();

    this.paintableFloorMeshes = new Set([this.floorMesh, this.platformTopMesh, this.rampTopMesh]);

    // Kept far apart (and well clear of the boundary walls) per the "start
    // points separated" requirement, with a slightly asymmetric route to
    // each side of the central platform.
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

  /** Same world-XZ -> UV mapping PaintSystem uses for the floor grid/texture. */
  _worldToPaintUV(x, z) {
    return [(x + this.halfWidth) / (this.halfWidth * 2), (z + this.halfDepth) / (this.halfDepth * 2)];
  }

  /** A floor-space paintable quad: shares PaintSystem's single world-mapped texture. */
  _buildPaintableQuad(corners) {
    const positions = new Float32Array(12);
    const uvs = new Float32Array(8);
    corners.forEach((c, i) => {
      positions[i * 3] = c.x;
      positions[i * 3 + 1] = c.y;
      positions[i * 3 + 2] = c.z;
      const [u, v] = this._worldToPaintUV(c.x, c.z);
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    });
    const indices = [0, 2, 1, 0, 3, 2];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ color: COLORS.floorBase, roughness: 0.9, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);
    return mesh;
  }

  _buildPlatformAndRamp() {
    const size = ARENA.platformSize;
    const h = ARENA.platformHeight;
    const hp = size / 2;
    const eps = 0.04;

    const platGeo = new THREE.BoxGeometry(size, h, size);
    const platMat = new THREE.MeshStandardMaterial({ color: COLORS.platform, roughness: 0.85 });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(0, h / 2, 0);
    this.group.add(platform);
    this.platformMesh = platform;

    this.platform = {
      min: new THREE.Vector2(-hp, -hp),
      max: new THREE.Vector2(hp, hp),
      height: h,
    };

    // Paintable overlay on the platform's top face, sitting a hair above the
    // box so it wins the z-fight without visibly floating.
    this.platformTopMesh = this._buildPaintableQuad([
      new THREE.Vector3(-hp, h + eps, -hp),
      new THREE.Vector3(hp, h + eps, -hp),
      new THREE.Vector3(hp, h + eps, hp),
      new THREE.Vector3(-hp, h + eps, hp),
    ]);

    // Ramp offset from center along X so the climb isn't perfectly symmetric.
    // Attached to the platform's +Z face; the other three faces get plain
    // walls (see _buildPlatformSideWalls) with two paintable climb panels.
    const rampWidth = ARENA.rampWidth;
    const rampLen = ARENA.rampLength;
    const rampOffsetX = 2.2;
    const rampMinX = rampOffsetX - rampWidth / 2;
    const rampMaxX = rampOffsetX + rampWidth / 2;
    const rampCenterZ = hp + rampLen / 2;
    const rampAngle = Math.atan2(h, rampLen);

    const rampGeo = new THREE.BoxGeometry(rampWidth, 0.4, rampLen / Math.cos(rampAngle));
    const rampMat = new THREE.MeshStandardMaterial({ color: COLORS.ramp, roughness: 0.88 });
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.position.set(rampOffsetX, h / 2, rampCenterZ);
    ramp.rotation.x = -rampAngle;
    this.group.add(ramp);
    this.rampMesh = ramp;

    this.ramp = {
      minX: rampMinX,
      maxX: rampMaxX,
      minZ: hp,
      maxZ: hp + rampLen,
      height: h,
      length: rampLen,
    };

    // Paintable overlay following the exact same linear height interpolation
    // as getGroundHeight()'s ramp branch, so the visible surface always
    // matches where feet actually land.
    this.rampTopMesh = this._buildPaintableQuad([
      new THREE.Vector3(rampMinX, eps, hp),
      new THREE.Vector3(rampMaxX, eps, hp),
      new THREE.Vector3(rampMaxX, h + eps, hp + rampLen),
      new THREE.Vector3(rampMinX, h + eps, hp + rampLen),
    ]);

    this._buildPlatformSideWalls(hp, h, rampMinX, rampMaxX);
    this._buildClimbPanels(hp, h);
  }

  // Blocks direct horizontal walk-in on 3 of the platform's 4 sides (the 4th
  // is the ramp opening), so the ramp and the two paint-gated climb panels
  // become the only ways up. Zero-thickness AABBs act as flat wall planes —
  // resolveObstacleCollisions() only needs a nonzero radius overlap check,
  // not real box volume — and (like every other collider here) they stop
  // blocking once a climber's y reaches the platform height.
  _buildPlatformSideWalls(hp, h, rampMinX, rampMaxX) {
    const add = (min, max) => this.boxColliders.push({ min: new THREE.Vector2(...min), max: new THREE.Vector2(...max), height: h });

    add([-hp, -hp], [-hp, hp]); // west face
    add([-hp, -hp], [hp, -hp]); // south face
    add([hp, -hp], [hp, hp]); // east face
    add([-hp, hp], [rampMinX, hp]); // north face, left of the ramp opening
    add([rampMaxX, hp], [hp, hp]); // north face, right of the ramp opening
  }

  // Two "paintable panel" faces (a subset of the platform's walls, per the
  // "don't make every wall paintable" guidance): once a team has painted
  // enough of one, Player's wall-climb logic lets them scale straight up it
  // instead of detouring to the ramp.
  _buildClimbPanels(hp, h) {
    const panelWidth = ARENA.climbPanelWidth;
    const half = panelWidth / 2;

    this.climbPanels.push(this._buildClimbPanel({
      origin: new THREE.Vector3(-hp, 0, -half),
      tangent: new THREE.Vector3(0, 0, 1),
      normal: new THREE.Vector3(1, 0, 0),
      planeAxis: 'x',
      planeValue: -hp,
      tangentMin: -half,
      tangentMax: half,
      height: h,
      width: panelWidth,
      visualOffset: new THREE.Vector3(-0.03, 0, 0),
    }));

    this.climbPanels.push(this._buildClimbPanel({
      origin: new THREE.Vector3(-half, 0, -hp),
      tangent: new THREE.Vector3(1, 0, 0),
      normal: new THREE.Vector3(0, 0, 1),
      planeAxis: 'z',
      planeValue: -hp,
      tangentMin: -half,
      tangentMax: half,
      height: h,
      width: panelWidth,
      visualOffset: new THREE.Vector3(0, 0, -0.03),
    }));
  }

  _buildClimbPanel({ origin, tangent, normal, planeAxis, planeValue, tangentMin, tangentMax, height, width, visualOffset }) {
    const paint = new WallPanel(origin, tangent, width, height);

    const c0 = origin.clone().add(visualOffset);
    const c1 = origin.clone().addScaledVector(tangent, width).add(visualOffset);
    const c2 = c1.clone().addScaledVector(_up, height);
    const c3 = c0.clone().addScaledVector(_up, height);

    const positions = new Float32Array(12);
    [c0, c1, c2, c3].forEach((c, i) => {
      positions[i * 3] = c.x;
      positions[i * 3 + 1] = c.y;
      positions[i * 3 + 2] = c.z;
    });
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const indices = [0, 2, 1, 0, 3, 2];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
    mat.map = paint.texture;
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);

    const panel = { paint, mesh, normal: normal.clone(), planeAxis, planeValue, tangentMin, tangentMax, height };
    this.climbPanelByMesh.set(mesh, panel);
    return panel;
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
      // Extra cover flanking the (now larger) central platform: breaks pure
      // sightlines around the objective and gives both spawns a second
      // ground-level lane besides the ramp/climb-panel routes.
      { type: 'cylinder', pos: [5.5, 1.1, -9.5], radius: 1.3, height: 2.2 },
      { type: 'box', pos: [-5, 1, 9.5], size: [2.2, 2, 2.2] },
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
