import * as THREE from 'three';
import { ARENA, THEME, DECOR } from '../config.js';
import { createSoftDotTexture, createWaterTexture, createSignTexture } from './StageTextures.js';

const _tmpPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpScale = new THREE.Vector3(1, 1, 1);
const _tmpMatrix = new THREE.Matrix4();
const _tmpEuler = new THREE.Euler();

// ============================================================================
// StageDecor — the purely cosmetic "neon marine battle arena" dressing layer:
// sky/sea/distant skyline, the central landmark, perimeter/obstacle trim,
// and a handful of animated props (drone, ship, blinking signs, flags).
//
// Everything here lives in its own THREE.Group added straight to the scene
// (never to `arena.group`). That separation matters: ProjectileManager
// snapshots `arena.group.children` once at startup as its hit-scan target
// list, so anything added there becomes shootable/blocking geometry. Keeping
// all of this in a sibling group means none of it can ever be hit by ink,
// block a shot, or affect collision/AI pathing — it only ever reads Arena's
// already-computed layout (halfWidth/halfDepth, platform/ramp, obstacleDefs,
// wallSpecs) to position itself, never mutates it.
//
// `lowQuality` (passed in from Game, based on touch/mobile detection) trims
// instance counts for the heaviest bits (clouds, drones, buoys) without
// changing which categories of decoration exist.
// ============================================================================
export class StageDecor {
  constructor(scene, arena, opts = {}) {
    this.scene = scene;
    this.arena = arena;
    this.lowQuality = !!opts.lowQuality;

    this.group = new THREE.Group();
    this.group.name = 'StageDecor';
    scene.add(this.group);

    /** @type {Array<(dt:number, t:number)=>void>} */
    this._animated = [];

    this.createBackgroundEnvironment();
    this.createArenaLandmark();
    this.createStageDecorations();
    this.createAnimatedProps();
  }

  // -------------------------------------------------------------- 1. sky/sea
  createBackgroundEnvironment() {
    this._buildSkyDome();
    this._buildSea();
    this._buildClouds();
    this._buildDistantSkyline();
  }

  _buildSkyDome() {
    const r = DECOR.skyDomeRadius;
    const geo = new THREE.SphereGeometry(r, 18, 12);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(THEME.skyTop);
    const horizon = new THREE.Color(THEME.skyHorizon);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp((pos.getY(i) / r + 1) / 2, 0, 1);
      c.copy(horizon).lerp(top, Math.pow(t, 0.55));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -10;
    this.group.add(dome);
  }

  _buildSea() {
    const r = DECOR.seaRadius;
    const geo = new THREE.CircleGeometry(r, 24);
    const waterTex = createWaterTexture(THEME.seaColor, THEME.seaHighlight);
    const waterTexEmissive = waterTex.clone();
    waterTexEmissive.needsUpdate = true;
    waterTex.repeat.set(r / 6, r / 6);
    waterTexEmissive.repeat.set(r / 9, r / 9);

    const mat = new THREE.MeshStandardMaterial({
      map: waterTex,
      emissiveMap: waterTexEmissive,
      emissive: new THREE.Color(THEME.seaHighlight),
      emissiveIntensity: 0.35,
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.5,
    });
    const sea = new THREE.Mesh(geo, mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = DECOR.seaY;
    this.group.add(sea);
    this._seaMat = mat;

    this._animated.push((dt) => {
      waterTex.offset.x += dt * DECOR.seaScrollSpeed;
      waterTexEmissive.offset.x -= dt * DECOR.seaScrollSpeed * 1.6;
      waterTexEmissive.offset.y += dt * DECOR.seaScrollSpeed * 0.4;
    });
  }

  _buildClouds() {
    const count = this.lowQuality ? DECOR.cloudCountLow : DECOR.cloudCount;
    const tex = createSoftDotTexture(THEME.neonWhite);
    const geo = new THREE.PlaneGeometry(11, 5);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false, fog: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;

    const spread = DECOR.cloudSpread;
    this._cloudState = [];
    for (let i = 0; i < count; i++) {
      const x = THREE.MathUtils.randFloatSpread(spread * 2);
      const z = THREE.MathUtils.randFloatSpread(spread * 2);
      const y = DECOR.cloudHeight + Math.random() * 10;
      const speed = (0.5 + Math.random() * 0.7) * DECOR.cloudDriftSpeed;
      const yaw = Math.random() * Math.PI;
      const scale = 1.2 + Math.random() * 1.4;
      this._cloudState.push({ x, y, z, speed, yaw, scale });
      this._composeInstance(mesh, i, x, y, z, yaw, scale);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this._cloudMesh = mesh;

    const limit = spread * 1.4;
    this._animated.push((dt) => {
      for (let i = 0; i < this._cloudState.length; i++) {
        const s = this._cloudState[i];
        s.x += s.speed * dt;
        if (s.x > limit) s.x = -limit;
        this._composeInstance(mesh, i, s.x, s.y, s.z, s.yaw, s.scale);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  _composeInstance(mesh, i, x, y, z, yaw, scale) {
    _tmpPos.set(x, y, z);
    _tmpEuler.set(0, yaw, 0);
    _tmpQuat.setFromEuler(_tmpEuler);
    _tmpScale.setScalar(scale);
    _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
    mesh.setMatrixAt(i, _tmpMatrix);
  }

  // Low-poly, unlit-ish silhouettes far past the play area: island, towers,
  // a ferris wheel. No colliders, no shadows, cheap geometry only.
  _buildDistantSkyline() {
    const R = DECOR.distantRadius;

    for (let i = 0; i < DECOR.distantIslandCount; i++) {
      const ang = (i / DECOR.distantIslandCount) * Math.PI * 2 + 0.6;
      const dist = R * (1.15 + Math.random() * 0.4);
      const geo = new THREE.ConeGeometry(6 + Math.random() * 4, 3 + Math.random() * 2, 6);
      const mat = new THREE.MeshStandardMaterial({ color: THEME.navyDeep, emissive: THEME.neonCyan, emissiveIntensity: 0.08, roughness: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(ang) * dist, DECOR.seaY + 1, Math.sin(ang) * dist);
      this.group.add(mesh);
    }

    for (let i = 0; i < DECOR.distantTowerCount; i++) {
      const ang = (i / DECOR.distantTowerCount) * Math.PI * 2 + 1.4;
      const dist = R * (1.05 + Math.random() * 0.3);
      const h = 14 + Math.random() * 22;
      const geo = new THREE.BoxGeometry(2.4 + Math.random() * 1.6, h, 2.4 + Math.random() * 1.6);
      const mat = new THREE.MeshStandardMaterial({
        color: THEME.navyMid,
        emissive: i % 2 === 0 ? THEME.neonPurple : THEME.neonCyan,
        emissiveIntensity: 0.22,
        roughness: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(ang) * dist, DECOR.seaY + h / 2, Math.sin(ang) * dist);
      this.group.add(mesh);
    }

    this._buildFerrisWheel(new THREE.Vector3(Math.cos(2.3) * R * 0.95, DECOR.seaY + 9, Math.sin(2.3) * R * 0.95));
  }

  _buildFerrisWheel(position) {
    const group = new THREE.Group();
    group.position.copy(position);

    const ringGeo = new THREE.TorusGeometry(7, 0.22, 6, 20);
    const ringMat = new THREE.MeshStandardMaterial({ color: THEME.navyMid, emissive: THEME.neonYellow, emissiveIntensity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    const legGeo = new THREE.CylinderGeometry(0.18, 0.18, 9, 5);
    const legMat = new THREE.MeshStandardMaterial({ color: THEME.navyDeep, roughness: 1 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(side * 3, -5, 0);
      leg.rotation.z = side * 0.35;
      group.add(leg);
    }

    const cabinGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const cabinMat = new THREE.MeshStandardMaterial({ color: THEME.neonWhite, emissive: THEME.neonCyan, emissiveIntensity: 1.1 });
    const cabinCount = 8;
    const cabins = new THREE.InstancedMesh(cabinGeo, cabinMat, cabinCount);
    for (let i = 0; i < cabinCount; i++) {
      const a = (i / cabinCount) * Math.PI * 2;
      _tmpPos.set(Math.cos(a) * 7, Math.sin(a) * 7, 0);
      _tmpQuat.identity();
      _tmpScale.setScalar(1);
      _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
      cabins.setMatrixAt(i, _tmpMatrix);
    }
    cabins.instanceMatrix.needsUpdate = true;
    group.add(cabins);

    this.group.add(group);
    this._animated.push((dt) => { ring.rotation.z += dt * 0.05; cabins.rotation.z += dt * 0.05; });
  }

  // ---------------------------------------------------------- 2. landmark
  createArenaLandmark() {
    const baseY = ARENA.platformHeight + DECOR.landmarkHeight;
    const group = new THREE.Group();
    group.position.set(0, baseY, 0);

    const coreGeo = new THREE.IcosahedronGeometry(DECOR.landmarkCoreRadius, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: THEME.neonWhite,
      emissive: THEME.neonCyan,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    const ringGeo = new THREE.TorusGeometry(DECOR.landmarkRingRadius, 0.06, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: THEME.neonPurple, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.3;
    group.add(ring);

    const ring2Geo = new THREE.TorusGeometry(DECOR.landmarkRingRadius * 0.68, 0.045, 8, 28);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: THEME.neonYellow, transparent: true, opacity: 0.8 });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = -Math.PI / 3;
    group.add(ring2);

    this.group.add(group);

    this._animated.push((dt, t) => {
      group.rotation.y += DECOR.landmarkRotateSpeed * dt;
      ring.rotation.z += DECOR.landmarkRingRotateSpeed * dt;
      ring2.rotation.z -= DECOR.landmarkRingRotateSpeed * 1.4 * dt;
      group.position.y = baseY + Math.sin(t * DECOR.landmarkBobSpeed) * DECOR.landmarkBobAmplitude;
      coreMat.emissiveIntensity = 1.5 + Math.sin(t * 2.2) * 0.4;
    });
  }

  // ------------------------------------------------- 3. perimeter/obstacle trim
  createStageDecorations() {
    this._buildPerimeterDressing();
    this._buildObstacleAccents();
  }

  /** Traces the rectangle at half-extents (hw,hd) for t in [0,1); used to scatter perimeter dressing evenly. */
  _pointOnRectPerimeter(t, hw, hd) {
    const segs = [
      [[-hw, -hd], [hw, -hd]],
      [[hw, -hd], [hw, hd]],
      [[hw, hd], [-hw, hd]],
      [[-hw, hd], [-hw, -hd]],
    ];
    const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
    const total = lens.reduce((a, b) => a + b, 0);
    let d = ((t % 1) + 1) % 1 * total;
    for (let i = 0; i < segs.length; i++) {
      if (d <= lens[i] || i === segs.length - 1) {
        const f = lens[i] > 0 ? d / lens[i] : 0;
        const [a, b] = segs[i];
        return [THREE.MathUtils.lerp(a[0], b[0], f), THREE.MathUtils.lerp(a[1], b[1], f)];
      }
      d -= lens[i];
    }
    return [0, 0];
  }

  _buildPerimeterDressing() {
    const wallH = ARENA.wallHeight;
    const hw = this.arena.halfWidth;
    const hd = this.arena.halfDepth;

    // Floating buoy lights just outside the walls, bobbing on the sea.
    const buoyGeo = new THREE.SphereGeometry(0.34, 6, 5);
    const buoyMat = new THREE.MeshStandardMaterial({ color: THEME.neonWhite, emissive: THEME.neonYellow, emissiveIntensity: 1.6, roughness: 0.4 });
    const buoyCount = this.lowQuality ? Math.ceil(DECOR.buoyCount / 2) : DECOR.buoyCount;
    const buoys = new THREE.InstancedMesh(buoyGeo, buoyMat, buoyCount);
    buoys.frustumCulled = false;
    const buoyBase = [];
    for (let i = 0; i < buoyCount; i++) {
      const [x, z] = this._pointOnRectPerimeter(i / buoyCount, hw + 2.4, hd + 2.4);
      buoyBase.push({ x, z, phase: Math.random() * Math.PI * 2 });
      this._composeInstance(buoys, i, x, DECOR.seaY + 0.5, z, 0, 1);
    }
    buoys.instanceMatrix.needsUpdate = true;
    this.group.add(buoys);
    this._animated.push((dt, t) => {
      for (let i = 0; i < buoyBase.length; i++) {
        const b = buoyBase[i];
        this._composeInstance(buoys, i, b.x, DECOR.seaY + 0.5 + Math.sin(t * 1.4 + b.phase) * 0.16, b.z, 0, 1);
      }
      buoys.instanceMatrix.needsUpdate = true;
    });

    // Perimeter light poles just outside the wall base.
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, wallH * 0.85, 5);
    const poleMat = new THREE.MeshStandardMaterial({ color: THEME.navyMid, emissive: THEME.neonCyan, emissiveIntensity: 1.1 });
    const poleCount = this.lowQuality ? Math.ceil(DECOR.perimeterLightCount / 2) : DECOR.perimeterLightCount;
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleCount);
    for (let i = 0; i < poleCount; i++) {
      const [x, z] = this._pointOnRectPerimeter((i + 0.4) / poleCount, hw + 0.65, hd + 0.65);
      this._composeInstance(poles, i, x, wallH * 0.42, z, 0, 1);
    }
    poles.instanceMatrix.needsUpdate = true;
    this.group.add(poles);

    // Glowing top-edge strip + a faintly transparent "energy barrier" panel
    // above each solid wall (purely decorative — colliders stay at the
    // original wallHeight, so this never changes what blocks movement).
    const glowMat = new THREE.MeshBasicMaterial({ color: THEME.neonCyan, transparent: true, opacity: 0.85, depthWrite: false });
    const barrierMat = new THREE.MeshBasicMaterial({ color: THEME.neonCyan, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    for (const s of this.arena.wallSpecs) {
      const [sx, , sz] = s.size;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), glowMat);
      strip.position.set(s.pos[0], wallH + 0.04, s.pos[2]);
      this.group.add(strip);

      const barrierH = 1.6;
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.98, barrierH, sz * 0.98), barrierMat);
      barrier.position.set(s.pos[0], wallH + barrierH / 2, s.pos[2]);
      this.group.add(barrier);
    }
  }

  _buildObstacleAccents() {
    const defs = this.arena.obstacleDefs;
    if (!defs?.length) return;

    const dotGeo = new THREE.IcosahedronGeometry(0.09, 0);
    const dotMat = new THREE.MeshStandardMaterial({ color: THEME.neonWhite, emissive: THEME.neonYellow, emissiveIntensity: 1.6 });
    const mesh = new THREE.InstancedMesh(dotGeo, dotMat, defs.length);
    defs.forEach((def, i) => {
      const topY = def.type === 'box' ? def.pos[1] + def.size[1] / 2 + 0.08 : def.pos[1] + def.height / 2 + 0.08;
      this._composeInstance(mesh, i, def.pos[0], topY, def.pos[2], 0, 1);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);

    this._animated.push((dt, t) => {
      dotMat.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.7;
    });
  }

  // -------------------------------------------------------- 4. animated props
  // Kept to a handful of categories per the mobile perf budget: a patrol
  // drone, a distant ship, blinking signage, and swaying flags (plus the
  // obstacle corner-light blink from createStageDecorations() and the
  // landmark's own rotation/bob). None of these carry colliders — they are
  // fully decoupled from gameplay logic.
  createAnimatedProps() {
    this._buildDrones();
    this._buildShip();
    this._buildBlinkingSigns();
    this._buildFlags();
  }

  _buildDrones() {
    const count = this.lowQuality ? DECOR.droneCountLow : DECOR.droneCount;
    this._drones = [];
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.12, 0.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: THEME.navyMid, emissive: THEME.neonPurple, emissiveIntensity: 0.5 });
    const lightGeo = new THREE.SphereGeometry(0.06, 6, 5);

    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(bodyGeo, bodyMat));
      const lightMat = new THREE.MeshStandardMaterial({ color: THEME.neonWhite, emissive: THEME.neonYellow, emissiveIntensity: 2 });
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.y = -0.08;
      group.add(light);
      this.group.add(group);
      this._drones.push({ group, lightMat, phase: (i / count) * Math.PI * 2 + Math.random() * 0.5 });
    }

    this._animated.push((dt, t) => {
      for (const d of this._drones) {
        const ang = t * DECOR.droneOrbitSpeed + d.phase;
        d.group.position.set(
          Math.cos(ang) * DECOR.droneOrbitRadius,
          DECOR.droneHeight + Math.sin(t * 1.3 + d.phase) * 0.4,
          Math.sin(ang) * DECOR.droneOrbitRadius,
        );
        d.group.rotation.y = -ang + Math.PI / 2;
        d.lightMat.emissiveIntensity = 1.2 + Math.sin(t * 6 + d.phase) * 1.0;
      }
    });
  }

  _buildShip() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: THEME.navyMid, emissive: THEME.neonCyan, emissiveIntensity: 0.3 });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1.4), hullMat));
    const cabinMat = new THREE.MeshStandardMaterial({ color: THEME.navyDeep, emissive: THEME.neonYellow, emissiveIntensity: 0.6 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1), cabinMat);
    cabin.position.set(-0.8, 0.9, 0);
    group.add(cabin);

    const R = DECOR.distantRadius;
    const startX = -R * 1.3;
    group.position.set(startX, DECOR.seaY + 0.5, R * 0.55);
    group.scale.setScalar(1.6);
    this.group.add(group);

    const endX = R * 1.3;
    this._animated.push((dt) => {
      group.position.x += DECOR.shipSpeed * dt;
      if (group.position.x > endX) group.position.x = startX;
    });
  }

  _buildBlinkingSigns() {
    const tex = createSignTexture(['NEO', 'ARENA'], THEME.neonYellow);
    const spots = [
      { pos: [-this.arena.halfWidth * 0.6, 3.2, this.arena.halfDepth * 0.68], color: THEME.neonCyan },
      { pos: [this.arena.halfWidth * 0.6, 3.2, -this.arena.halfDepth * 0.68], color: THEME.neonOrange },
    ];
    this._signs = [];
    for (const s of spots) {
      const mat = new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: new THREE.Color(s.color), emissiveIntensity: 1.3, roughness: 0.5, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), mat);
      mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
      mesh.lookAt(0, s.pos[1], 0);
      this.group.add(mesh);
      this._signs.push({ mat, phase: Math.random() * Math.PI * 2 });
    }
    this._animated.push((dt, t) => {
      for (const s of this._signs) s.mat.emissiveIntensity = 1.0 + Math.sin(t * DECOR.signBlinkSpeed + s.phase) * 0.55;
    });
  }

  _buildFlags() {
    const count = DECOR.flagCount;
    const poleMat = new THREE.MeshStandardMaterial({ color: THEME.navyMid, roughness: 0.9 });
    this._flags = [];
    for (let i = 0; i < count; i++) {
      const [x, z] = this._pointOnRectPerimeter(i / count + 0.12, this.arena.halfWidth - 1.2, this.arena.halfDepth - 1.2);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, ARENA.wallHeight * 0.9, 5), poleMat);
      pole.position.set(x, ARENA.wallHeight * 0.45, z);
      this.group.add(pole);

      const flagMat = new THREE.MeshStandardMaterial({
        color: THEME.neonWhite,
        emissive: i % 2 === 0 ? THEME.neonCyan : THEME.neonOrange,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide,
      });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), flagMat);
      flag.position.set(x + 0.5, ARENA.wallHeight * 0.82, z);
      this.group.add(flag);
      this._flags.push({ flag, phase: i * 1.3 });
    }
    this._animated.push((dt, t) => {
      for (const f of this._flags) f.flag.rotation.y = Math.sin(t * 1.8 + f.phase) * 0.35;
    });
  }

  // -------------------------------------------------------------- per-frame
  /** Advances every registered decoration animation. Purely visual — never touches gameplay state. */
  updateStageAnimations(dt, elapsedTime) {
    for (const fn of this._animated) fn(dt, elapsedTime);
  }
}
