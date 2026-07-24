import * as THREE from 'three';
import { ARENA, COLORS, THEME, DECOR } from '../config.js';
import { WallPanel } from './WallPanel.js';
import { createPanelTexture, createMetalTexture, createHazardStripeTexture, createSignTexture } from './StageTextures.js';

const _up = new THREE.Vector3(0, 1, 0);

// ============================================================================
// Arena — builds the single starter stage: a rectangular floor, a raised
// central platform reached by an off-center ramp and paintable climb
// surfaces, scattered obstacles, and perimeter walls that double as the
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
// of recognizing which mesh a projectile hit. Vertical surfaces use separate
// grids because their paint is also gameplay state for climbing.
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
    /** All vertical paint surfaces; climbPanels is the climbable subset. */
    this.wallPanels = [];
    this.climbPanels = [];
    this.wallPanelByMesh = new Map();
    this.climbPanelByMesh = this.wallPanelByMesh;
    /** @type {{pos:number[], size?:number[], radius?:number, height:number, type:string}[]} exposed read-only for StageDecor's accent lights/no-collision dressing */
    this.obstacleDefs = [];
    /** @type {{pos:number[], size:number[]}[]} exposed read-only for StageDecor's perimeter fence/lights */
    this.wallSpecs = [];

    this._buildSharedTextures();
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

  // Builds a small set of shared CanvasTextures (metal hull / accent panel /
  // hazard stripe / signage) used across the platform, ramp, obstacles and
  // walls below. Kept to a handful of tiny textures — clones (not re-draws)
  // are made per surface just to set a surface-appropriate UV repeat, so
  // GPU memory stays trivial even on mobile.
  _buildSharedTextures() {
    this._texMetal = createMetalTexture(COLORS.wall, THEME.neonCyan);
    this._texPanelCyan = createPanelTexture(THEME.neonCyan);
    this._texPanelPurple = createPanelTexture(THEME.neonPurple);
    this._texPanelYellow = createPanelTexture(THEME.neonYellow, 0x2a2440);
    this._texHazard = createHazardStripeTexture();
    this._texSign = createSignTexture(['CHROMA', 'ARENA'], THEME.neonCyan);
  }

  _repeatClone(tex, rx, ry) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return t;
  }

  /** Navy hull material with a glowing seam (emissiveMap), used for generic structural surfaces. */
  _hullMaterial(texPair, rx, ry, emissiveHex = THEME.neonCyan, intensity = DECOR.emissiveIntensity * 0.6) {
    return new THREE.MeshStandardMaterial({
      map: this._repeatClone(texPair.map, rx, ry),
      emissiveMap: this._repeatClone(texPair.emissiveMap, rx, ry),
      emissive: new THREE.Color(emissiveHex),
      emissiveIntensity: intensity,
      roughness: 0.72,
      metalness: 0.32,
    });
  }

  /** Backlit signage/logo material — the sign texture itself doubles as its own emissive map. */
  _signMaterial(tex = this._texSign, emissiveHex = THEME.neonCyan, intensity = DECOR.emissiveIntensity) {
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(emissiveHex),
      emissiveIntensity: intensity,
      roughness: 0.55,
      metalness: 0.1,
    });
  }

  /** Plain flat material for faces that are always hidden (box bottoms, faces behind climb panels). */
  _flatMaterial(colorHex) {
    return new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.85, metalness: 0.08 });
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
      roughness: 0.8,
      metalness: 0.06,
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

    const mat = new THREE.MeshStandardMaterial({ color: COLORS.floorBase, roughness: 0.8, metalness: 0.06, side: THREE.DoubleSide });
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
    // Face order for a BoxGeometry is [+x, -x, +y, -y, +z, -z]. +X is the
    // +X carries the big landmark signage; the climb-panel overlay added
    // later leaves enough of that face visible to keep it readable.
    // (top/bottom are always hidden, under the paint overlay or the floor).
    const hullSide = this._hullMaterial(this._texMetal, size / 2.4, h / 1.6, THEME.neonCyan);
    const hullHidden = this._flatMaterial(COLORS.platform);
    const platMaterials = [
      this._signMaterial(this._texSign, THEME.neonCyan, DECOR.emissiveIntensity),
      hullSide,
      hullHidden,
      hullHidden,
      hullSide,
      hullSide,
    ];
    const platform = new THREE.Mesh(platGeo, platMaterials);
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
    // Attached to the platform's +Z face; the remaining faces are blocked by
    // walls (see _buildPlatformSideWalls) and every exposed side is paintable.
    const rampWidth = ARENA.rampWidth;
    const rampLen = ARENA.rampLength;
    const rampOffsetX = ARENA.rampOffsetX;
    const rampMinX = rampOffsetX - rampWidth / 2;
    const rampMaxX = rampOffsetX + rampWidth / 2;
    const rampCenterZ = hp + rampLen / 2;
    const rampAngle = Math.atan2(h, rampLen);

    const rampGeo = new THREE.BoxGeometry(rampWidth, 0.4, rampLen / Math.cos(rampAngle));
    const rampMat = new THREE.MeshStandardMaterial({
      map: this._repeatClone(this._texHazard, rampWidth / 1.5, 1),
      roughness: 0.8,
      metalness: 0.15,
    });
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
  // is the ramp opening), so reaching the top requires the ramp or a painted
  // climbing route. Zero-thickness AABBs act as flat wall planes —
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

  // Cover every blocked platform face. The north side is split around the
  // ramp opening so players never start a wall climb on empty space.
  _buildClimbPanels(hp, h) {
    this._registerWallPanel({
      label: 'PLATFORM WEST',
      origin: new THREE.Vector3(-hp, 0, -hp),
      tangent: new THREE.Vector3(0, 0, 1),
      normal: new THREE.Vector3(1, 0, 0),
      height: h,
      width: hp * 2,
      visualOffset: new THREE.Vector3(-0.03, 0, 0),
    });

    this._registerWallPanel({
      label: 'PLATFORM SOUTH',
      origin: new THREE.Vector3(-hp, 0, -hp),
      tangent: new THREE.Vector3(1, 0, 0),
      normal: new THREE.Vector3(0, 0, 1),
      height: h,
      width: hp * 2,
      visualOffset: new THREE.Vector3(0, 0, -0.03),
    });

    this._registerWallPanel({
      label: 'PLATFORM EAST',
      origin: new THREE.Vector3(hp, 0, -hp),
      tangent: new THREE.Vector3(0, 0, 1),
      normal: new THREE.Vector3(-1, 0, 0),
      height: h,
      width: hp * 2,
      visualOffset: new THREE.Vector3(0.03, 0, 0),
    });

    const rampMinX = this.ramp.minX;
    const rampMaxX = this.ramp.maxX;
    this._registerWallPanel({
      label: 'PLATFORM NORTH WEST',
      origin: new THREE.Vector3(-hp, 0, hp),
      tangent: new THREE.Vector3(1, 0, 0),
      normal: new THREE.Vector3(0, 0, -1),
      height: h,
      width: rampMinX + hp,
      visualOffset: new THREE.Vector3(0, 0, 0.03),
    });
    this._registerWallPanel({
      label: 'PLATFORM NORTH EAST',
      origin: new THREE.Vector3(rampMaxX, 0, hp),
      tangent: new THREE.Vector3(1, 0, 0),
      normal: new THREE.Vector3(0, 0, -1),
      height: h,
      width: hp - rampMaxX,
      visualOffset: new THREE.Vector3(0, 0, 0.03),
    });
  }

  _registerWallPanel(options) {
    const panel = this._buildClimbPanel(options);
    this.wallPanels.push(panel);
    if (panel.climbable) this.climbPanels.push(panel);
    return panel;
  }

  _buildClimbPanel({
    label,
    origin,
    tangent,
    normal,
    height,
    width,
    visualOffset,
    climbable = true,
  }) {
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

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
    });
    mat.map = paint.texture;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);

    const panel = {
      label,
      paint,
      mesh,
      normal: normal.clone().normalize(),
      height,
      baseY: origin.y,
      topY: origin.y + height,
      climbable,
    };
    this.wallPanelByMesh.set(mesh, panel);
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
      // Jumpable waist-high cover divides the four approach lanes without
      // becoming a hard wall. Players can shoot around it, hop over it, or
      // use it to break line of sight while repainting an escape route.
      { type: 'box', pos: [-11, 0.45, 0], size: [3.8, 0.9, 1.2] },
      { type: 'box', pos: [11, 0.45, 0], size: [3.8, 0.9, 1.2] },
      { type: 'box', pos: [0, 0.45, -11], size: [1.2, 0.9, 3.8] },
      { type: 'box', pos: [0, 0.45, 11], size: [1.2, 0.9, 3.8] },
    ];
    this.obstacleDefs = defs;

    // Only the obstacles closest to the central platform get the stronger
    // "featured" accent-panel treatment (cycling cyan/purple/yellow); the
    // rest share one plain navy hull material so decoration budget goes
    // where players actually look, per the "don't over-decorate everything"
    // guidance.
    const regularMat = this._hullMaterial(this._texMetal, 1.3, 1, THEME.neonCyan, DECOR.emissiveIntensity * 0.45);
    const accentPairs = [this._texPanelCyan, this._texPanelPurple, this._texPanelYellow];
    const accentColors = [THEME.neonCyan, THEME.neonPurple, THEME.neonYellow];
    let accentIdx = 0;

    for (const def of defs) {
      const distFromCenter = Math.hypot(def.pos[0], def.pos[2]);
      const featured = distFromCenter < 12.5;
      let mat = regularMat;
      if (featured) {
        const i = accentIdx++ % accentPairs.length;
        const rx = def.type === 'box' ? Math.max(1, def.size[0] / 2.4) : Math.max(1, (Math.PI * 2 * def.radius) / 2.8);
        const ry = def.type === 'box' ? Math.max(1, def.size[1] / 2) : Math.max(1, def.height / 2);
        mat = this._hullMaterial(accentPairs[i], rx, ry, accentColors[i], DECOR.emissiveIntensity * 0.75);
      }

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
        this._registerBoxWallPanels(def, this.obstacleDefs.indexOf(def));
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
        this._registerCylinderWallPanels(def, this.obstacleDefs.indexOf(def));
      }
    }
  }

  _registerBoxWallPanels(def, index) {
    const [cx, cy, cz] = def.pos;
    const [sx, sy, sz] = def.size;
    const baseY = cy - sy / 2;
    const eps = 0.035;
    const faces = [
      {
        suffix: 'WEST',
        origin: new THREE.Vector3(cx - sx / 2, baseY, cz - sz / 2),
        tangent: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(1, 0, 0),
        width: sz,
        offset: new THREE.Vector3(-eps, 0, 0),
      },
      {
        suffix: 'EAST',
        origin: new THREE.Vector3(cx + sx / 2, baseY, cz - sz / 2),
        tangent: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(-1, 0, 0),
        width: sz,
        offset: new THREE.Vector3(eps, 0, 0),
      },
      {
        suffix: 'SOUTH',
        origin: new THREE.Vector3(cx - sx / 2, baseY, cz - sz / 2),
        tangent: new THREE.Vector3(1, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
        width: sx,
        offset: new THREE.Vector3(0, 0, -eps),
      },
      {
        suffix: 'NORTH',
        origin: new THREE.Vector3(cx - sx / 2, baseY, cz + sz / 2),
        tangent: new THREE.Vector3(1, 0, 0),
        normal: new THREE.Vector3(0, 0, -1),
        width: sx,
        offset: new THREE.Vector3(0, 0, eps),
      },
    ];
    for (const face of faces) {
      this._registerWallPanel({
        label: `BOX ${index + 1} ${face.suffix}`,
        origin: face.origin,
        tangent: face.tangent,
        normal: face.normal,
        width: face.width,
        height: sy,
        visualOffset: face.offset,
      });
    }
  }

  _registerCylinderWallPanels(def, index) {
    const [cx, cy, cz] = def.pos;
    const baseY = cy - def.height / 2;
    const segments = 8;
    const step = Math.PI * 2 / segments;
    const sagitta = def.radius * (1 - Math.cos(step / 2));

    for (let i = 0; i < segments; i++) {
      const a0 = i * step;
      const a1 = (i + 1) * step;
      const p0 = new THREE.Vector3(
        cx + Math.cos(a0) * def.radius,
        baseY,
        cz + Math.sin(a0) * def.radius,
      );
      const p1 = new THREE.Vector3(
        cx + Math.cos(a1) * def.radius,
        baseY,
        cz + Math.sin(a1) * def.radius,
      );
      const tangent = p1.clone().sub(p0);
      const width = tangent.length();
      tangent.normalize();
      const midpoint = p0.clone().add(p1).multiplyScalar(0.5);
      const normal = new THREE.Vector3(cx - midpoint.x, 0, cz - midpoint.z).normalize();
      const visualOffset = normal.clone().multiplyScalar(-(sagitta + 0.035));

      this._registerWallPanel({
        label: `CYLINDER ${index + 1} FACE ${i + 1}`,
        origin: p0,
        tangent,
        normal,
        width,
        height: def.height,
        visualOffset,
      });
    }
  }

  _buildWalls() {
    const wallH = ARENA.wallHeight;
    const t = 1;
    const w = ARENA.width;
    const d = ARENA.depth;

    const specs = [
      { pos: [0, wallH / 2, d / 2 + t / 2], size: [w + t * 2, wallH, t], signFace: true },
      { pos: [0, wallH / 2, -d / 2 - t / 2], size: [w + t * 2, wallH, t] },
      { pos: [w / 2 + t / 2, wallH / 2, 0], size: [t, wallH, d] },
      { pos: [-w / 2 - t / 2, wallH / 2, 0], size: [t, wallH, d] },
    ];
    this.wallSpecs = specs;

    for (const s of specs) {
      const mat = s.signFace
        // Face order [+x,-x,+y,-y,+z,-z]; this wall is thin along Z, so its
        // -z face (index 5) is the one facing the arena — that's where the
        // big landmark sign goes, matching _buildPlatformAndRamp's signage.
        ? [
            this._hullMaterial(this._texMetal, s.size[0] / 3, wallH / 1.6, THEME.neonPurple),
            this._hullMaterial(this._texMetal, s.size[0] / 3, wallH / 1.6, THEME.neonPurple),
            this._flatMaterial(COLORS.wall),
            this._flatMaterial(COLORS.wall),
            this._hullMaterial(this._texMetal, s.size[0] / 3, wallH / 1.6, THEME.neonPurple),
            this._signMaterial(this._texSign, THEME.neonPurple, DECOR.emissiveIntensity),
          ]
        : this._hullMaterial(this._texMetal, s.size[0] / 3, wallH / 1.6, THEME.neonCyan);
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

    // Paint overlays face inward. Perimeter panels deliberately remain
    // non-climbable because mounting their top would move a player outside
    // the playable bounds; every arena-interior wall remains climbable.
    const boundaryPanels = [
      {
        label: 'BOUNDARY NORTH',
        origin: new THREE.Vector3(-w / 2, 0, d / 2),
        tangent: new THREE.Vector3(1, 0, 0),
        normal: new THREE.Vector3(0, 0, 1),
        width: w,
        offset: new THREE.Vector3(0, 0, -0.035),
      },
      {
        label: 'BOUNDARY SOUTH',
        origin: new THREE.Vector3(-w / 2, 0, -d / 2),
        tangent: new THREE.Vector3(1, 0, 0),
        normal: new THREE.Vector3(0, 0, -1),
        width: w,
        offset: new THREE.Vector3(0, 0, 0.035),
      },
      {
        label: 'BOUNDARY EAST',
        origin: new THREE.Vector3(w / 2, 0, -d / 2),
        tangent: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(1, 0, 0),
        width: d,
        offset: new THREE.Vector3(-0.035, 0, 0),
      },
      {
        label: 'BOUNDARY WEST',
        origin: new THREE.Vector3(-w / 2, 0, -d / 2),
        tangent: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(-1, 0, 0),
        width: d,
        offset: new THREE.Vector3(0.035, 0, 0),
      },
    ];
    for (const panel of boundaryPanels) {
      this._registerWallPanel({
        label: panel.label,
        origin: panel.origin,
        tangent: panel.tangent,
        normal: panel.normal,
        width: panel.width,
        height: wallH,
        visualOffset: panel.offset,
        climbable: false,
      });
    }
  }

  /** Ground height (y) at a given XZ, accounting for platform + ramp. Does not include obstacles. */
  getGroundHeight(x, z) {
    let groundHeight = 0;
    const p = this.platform;
    if (x >= p.min.x && x <= p.max.x && z >= p.min.y && z <= p.max.y) {
      groundHeight = p.height;
    }
    const r = this.ramp;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
      const t = (z - r.minZ) / r.length; // 0 at floor edge, 1 at platform edge
      groundHeight = Math.max(groundHeight, THREE.MathUtils.clamp(t, 0, 1) * r.height);
    }

    // Once a painted obstacle wall is climbed, its top becomes ordinary
    // walkable ground. This query mirrors the existing collider footprints.
    for (const box of this.boxColliders) {
      if (box.min.x === box.max.x || box.min.y === box.max.y) continue;
      if (x >= box.min.x && x <= box.max.x && z >= box.min.y && z <= box.max.y) {
        groundHeight = Math.max(groundHeight, box.height);
      }
    }
    for (const cylinder of this.cylinderColliders) {
      const dx = x - cylinder.center.x;
      const dz = z - cylinder.center.y;
      if (dx * dx + dz * dz <= cylinder.radius * cylinder.radius) {
        groundHeight = Math.max(groundHeight, cylinder.height);
      }
    }
    return groundHeight;
  }

  /** Clamp a horizontal position to remain within the playable floor (inside the walls). */
  clampToBounds(x, z, margin = 0.5) {
    const hw = this.halfWidth - margin;
    const hd = this.halfDepth - margin;
    return [THREE.MathUtils.clamp(x, -hw, hw), THREE.MathUtils.clamp(z, -hd, hd)];
  }
}
