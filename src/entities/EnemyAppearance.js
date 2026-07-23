import * as THREE from 'three';

// ============================================================================
// EnemyAppearance — purely-cosmetic enemy character construction.
//
// This module owns EVERYTHING about how a CPU enemy *looks* and nothing about
// how it *behaves*. It builds low-poly, deformed "street / sport" humanoid
// rigs in four visual archetypes (speed / street / heavy / technical) using a
// small shared set of cached geometries and ~7 materials per enemy, so draw
// calls and material count stay mobile-friendly.
//
// It is deliberately decoupled from gameplay:
//  - it never reads or writes HP / AI / movement / collision state
//  - collision still uses MOVEMENT.capsuleRadius/Height constants elsewhere,
//    so nothing here can change hit detection
//  - the caller (EnemyAI) keeps the root object, team tag and colliders
//
// Geometries are cached at module scope and shared across every build (and
// never disposed) — colours differ per enemy so only the materials are
// per-instance and disposable.
// ============================================================================

// ---------------------------------------------------------------- palettes
// Each archetype ships a small hand-tuned palette list so colours always stay
// harmonious per type rather than being fully random.
export const enemyPalettes = {
  speed: [
    { main: '#F4E733', sub: '#FF7A21', dark: '#252525' },
    { main: '#A8FF35', sub: '#28C7D9', dark: '#20232A' },
    { main: '#FFB020', sub: '#7CFF4F', dark: '#242017' },
  ],
  street: [
    { main: '#276BFF', sub: '#7A3CFF', dark: '#171A22' },
    { main: '#222831', sub: '#00C2FF', dark: '#111318' },
    { main: '#3A2E8C', sub: '#22D3FF', dark: '#141225' },
  ],
  heavy: [
    { main: '#FF4B32', sub: '#FF9D21', dark: '#241815' },
    { main: '#D93636', sub: '#F4C531', dark: '#1B1B1B' },
    { main: '#B3311F', sub: '#FF7A21', dark: '#20120E' },
  ],
  technical: [
    { main: '#52D9FF', sub: '#FF62C7', dark: '#29243D' },
    { main: '#EDEDED', sub: '#A854FF', dark: '#20202B' },
    { main: '#8FE7FF', sub: '#FF8AD8', dark: '#242038' },
  ],
};

// Ordered list — index is the appearance "type" used by the debug cycle and
// by randomizeEnemyAppearance(typeIndex). Order defines the cycle sequence:
// Speed -> Street -> Heavy -> Technical -> Speed.
export const enemyAppearancePresets = [
  { id: 'speed', name: 'SPEED PUNK', bodyScale: [0.9, 1.05, 0.9], hairType: 'long', outfitType: 'light', accessoryType: 'goggles' },
  { id: 'street', name: 'STREET SHARK', bodyScale: [1.0, 1.0, 1.0], hairType: 'medium', outfitType: 'hoodie', accessoryType: 'cap' },
  { id: 'heavy', name: 'HEAVY BEAT', bodyScale: [1.15, 1.1, 1.15], hairType: 'thick', outfitType: 'armor', accessoryType: 'helmet' },
  { id: 'technical', name: 'TECH GLITCH', bodyScale: [0.95, 1.0, 0.95], hairType: 'asymmetry', outfitType: 'tech', accessoryType: 'visor' },
];

const SKIN_TONES = ['#F1C9A5', '#E7B48C', '#C98A5A', '#9C6B3F', '#7A4A2B', '#B7E3C9', '#C9BEF2'];
const EYE_COLORS = ['#151515', '#2A2A2A', '#3355FF', '#FF3E7A', '#22E0B0', '#FFC93C'];

// ------------------------------------------------------------ tiny helpers
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rand(min, max) {
  return min + Math.random() * (max - min);
}
function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Map an appearance id back to its index in enemyAppearancePresets. */
export function enemyTypeIndex(id) {
  const i = enemyAppearancePresets.findIndex((p) => p.id === id);
  return i < 0 ? 0 : i;
}

// ---------------------------------------------------- cached geometry pool
// Keyed by shape+dimensions so identical primitives are only built once and
// reused across every enemy build. Never disposed (shared, cheap, immortal).
const _geoCache = new Map();
function cached(key, factory) {
  let g = _geoCache.get(key);
  if (!g) { g = factory(); _geoCache.set(key, g); }
  return g;
}
const gBox = (w, h, d) => cached(`b:${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const gSphere = (r) => cached(`s:${r}`, () => new THREE.SphereGeometry(r, 12, 10));
const gCapsule = (r, l) => cached(`c:${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 3, 8));
const gCone = (r, h) => cached(`n:${r},${h}`, () => new THREE.ConeGeometry(r, h, 6));
const gCyl = (rt, rb, h) => cached(`y:${rt},${rb},${h}`, () => new THREE.CylinderGeometry(rt, rb, h, 8));

// ------------------------------------------------------ appearance config
function exprToFace(expr) {
  switch (expr) {
    case 'fierce': return { eyeTilt: 0.22, browTilt: 0.42, showBrows: true };  // angry, inner-down
    case 'cool': return { eyeTilt: 0.14, browTilt: -0.14, showBrows: true };   // aloof, outer-down
    case 'smirk': return { eyeTilt: 0.16, browTilt: 0.10, showBrows: true };
    default: return { eyeTilt: 0.08, browTilt: 0.0, showBrows: false };        // calm
  }
}

/**
 * Roll a full randomized-but-harmonious appearance config for a given type
 * index. Only the *type* fixes silhouette/outfit/accessory family; colours,
 * skin, eyes, hair length, headgear presence and expression are randomized
 * within that type's tasteful bounds.
 */
export function randomizeEnemyAppearance(typeIndex) {
  const preset = enemyAppearancePresets[THREE.MathUtils.clamp(typeIndex | 0, 0, 3)];
  const pal = randChoice(enemyPalettes[preset.id]);
  const expr = randChoice(['calm', 'cool', 'fierce', 'smirk']);

  const hairLenBase = { long: 0.55, medium: 0.34, thick: 0.36, asymmetry: 0.46 }[preset.hairType];
  const hairCount = { long: 6, medium: 5, thick: 5, asymmetry: 6 }[preset.hairType];
  const hairThick = { long: 0.08, medium: 0.095, thick: 0.15, asymmetry: 0.085 }[preset.hairType];

  return {
    id: preset.id,
    name: preset.name,
    bodyScale: preset.bodyScale.slice(),
    outfitType: preset.outfitType,
    accessoryType: preset.accessoryType,

    main: pal.main,
    sub: pal.sub,
    dark: pal.dark,
    skin: randChoice(SKIN_TONES),
    eyeColor: randChoice(EYE_COLORS),
    shoeColor: randChoice([pal.sub, pal.dark, '#F0F0F0', '#141414']),

    headRadius: 0.3 + rand(-0.02, 0.03),
    headY: 1.72,
    hasHeadgear: Math.random() < 0.85,
    headphones: preset.id === 'speed' && Math.random() < 0.5,

    hair: {
      type: preset.hairType,
      count: hairCount,
      length: hairLenBase * rand(0.85, 1.15),
      thick: hairThick,
      asym: preset.hairType === 'asymmetry',
    },

    expression: expr,
    ...exprToFace(expr),
  };
}

// ------------------------------------------------------------- materials
/**
 * Build the small per-enemy material set from the config's colours and push
 * every material into `materials` so the caller can drive the shared
 * invincibility-flicker / hit-flash effects and dispose them later.
 */
export function applyEnemyPalette(cfg, materials) {
  const std = (color, extra) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...extra });
    materials.push(m);
    return m;
  };
  return {
    main: std(cfg.main),
    sub: std(cfg.sub, { roughness: 0.5, metalness: 0.2 }),
    dark: std(cfg.dark, { roughness: 0.6, metalness: 0.25 }),
    skin: std(cfg.skin, { roughness: 0.72, metalness: 0.0 }),
    eye: std(cfg.eyeColor, { emissive: cfg.eyeColor, emissiveIntensity: 0.45, roughness: 0.3 }),
    shoe: std(cfg.shoeColor, { roughness: 0.5, metalness: 0.2 }),
    // Single (opaque, glossy) "glass" material for goggles/visor lenses — kept
    // non-transparent on purpose to honour the "minimize translucency" goal.
    glass: std('#EAF6FF', { emissive: '#20303a', emissiveIntensity: 0.6, roughness: 0.18, metalness: 0.35 }),
  };
}

// ------------------------------------------------------------ part builders
// Every builder returns a flat array of Meshes positioned in feet-origin
// space (feet at y=0), matching the base Character envelope so the visor/eyes
// face -Z (forward) exactly like the original rig.

export function createEnemyBody(cfg, mats) {
  const parts = [];

  const hips = new THREE.Mesh(gBox(0.5, 0.28, 0.34), mats.sub);
  hips.position.y = 0.7;
  parts.push(hips);

  const legGeo = gCapsule(0.13, 0.5);
  const legL = new THREE.Mesh(legGeo, mats.dark); legL.position.set(-0.16, 0.4, 0);
  const legR = new THREE.Mesh(legGeo, mats.dark); legR.position.set(0.16, 0.4, 0);
  parts.push(legL, legR);

  const shoeGeo = gBox(0.26, 0.16, 0.42);
  const shoeL = new THREE.Mesh(shoeGeo, mats.shoe); shoeL.position.set(-0.16, 0.09, -0.06);
  const shoeR = new THREE.Mesh(shoeGeo, mats.shoe); shoeR.position.set(0.16, 0.09, -0.06);
  parts.push(shoeL, shoeR);

  const torso = new THREE.Mesh(gCapsule(0.34, 0.5), mats.main);
  torso.position.y = 1.12;
  parts.push(torso);

  const armGeo = gCapsule(0.11, 0.44);
  const armL = new THREE.Mesh(armGeo, mats.main); armL.position.set(-0.44, 1.12, 0); armL.rotation.z = 0.12;
  const armR = new THREE.Mesh(armGeo, mats.main); armR.position.set(0.44, 1.12, 0); armR.rotation.z = -0.12;
  parts.push(armL, armR);

  const handGeo = gSphere(0.1);
  const handL = new THREE.Mesh(handGeo, mats.skin); handL.position.set(-0.5, 0.86, 0);
  const handR = new THREE.Mesh(handGeo, mats.skin); handR.position.set(0.5, 0.86, 0);
  parts.push(handL, handR);

  return parts;
}

export function createEnemyHead(cfg, mats) {
  const parts = [];
  const hr = cfg.headRadius;
  const hy = cfg.headY;

  const head = new THREE.Mesh(gSphere(0.3), mats.skin);
  head.scale.set(hr / 0.3, (hr / 0.3) * 0.98, (hr / 0.3) * 0.96);
  head.position.y = hy;
  parts.push(head);

  // Horizontally-long, slightly slanted "sharp" eyes on the front (-Z) face.
  const eyeGeo = gBox(0.16, 0.07, 0.05);
  const eyeY = hy + 0.02;
  const eyeZ = -(hr * 0.86);
  const eyeL = new THREE.Mesh(eyeGeo, mats.eye); eyeL.position.set(-0.12, eyeY, eyeZ); eyeL.rotation.z = cfg.eyeTilt;
  const eyeR = new THREE.Mesh(eyeGeo, mats.eye); eyeR.position.set(0.12, eyeY, eyeZ); eyeR.rotation.z = -cfg.eyeTilt;
  parts.push(eyeL, eyeR);

  if (cfg.showBrows) {
    const browGeo = gBox(0.15, 0.035, 0.04);
    const browY = eyeY + 0.1;
    const bl = new THREE.Mesh(browGeo, mats.dark); bl.position.set(-0.12, browY, eyeZ + 0.01); bl.rotation.z = cfg.browTilt;
    const br = new THREE.Mesh(browGeo, mats.dark); br.position.set(0.12, browY, eyeZ + 0.01); br.rotation.z = -cfg.browTilt;
    parts.push(bl, br);
  }

  return parts;
}

const _up = new THREE.Vector3(0, -1, 0);

export function createEnemyTentacleHair(cfg, mats) {
  const parts = [];
  const hr = cfg.headRadius;
  const hy = cfg.headY;
  const h = cfg.hair;

  for (let i = 0; i < h.count; i++) {
    const lr = i % 2 === 0 ? -1 : 1;
    const t = i / h.count;

    // Anchor on the upper-back hemisphere of the head, projected to surface.
    const anchorDir = new THREE.Vector3(lr * (0.4 + 0.4 * t), 0.35 + 0.5 * (1 - t), 0.2 + 0.6 * t).normalize();
    const anchor = new THREE.Vector3(anchorDir.x * hr, hy + anchorDir.y * hr, anchorDir.z * hr);

    // Tentacles droop outward-back-down; asymmetry type makes one side longer.
    let len = h.length;
    if (h.asym) len *= lr < 0 ? 1.25 : 0.7;
    const dir = new THREE.Vector3(anchorDir.x * 0.5, -1, anchorDir.z * 0.6 + 0.3).normalize();

    const strand = new THREE.Mesh(gCyl(h.thick * 0.3, h.thick, len), mats.main);
    strand.position.copy(anchor).addScaledVector(dir, len * 0.5);
    strand.quaternion.setFromUnitVectors(_up, dir);
    parts.push(strand);
  }

  // A short front tuft so the head never reads as bald from the front.
  const tuft = new THREE.Mesh(gCyl(h.thick * 0.4, h.thick * 1.1, h.length * 0.5), mats.main);
  tuft.position.set(0, hy + hr * 0.9, hr * 0.2);
  tuft.rotation.x = -0.5;
  parts.push(tuft);

  return parts;
}

export function createEnemyOutfit(cfg, mats) {
  const parts = [];
  const type = cfg.outfitType;

  // Shoulder pads + back fin are shared silhouette breakers (also rear cues).
  const padGeo = gBox(0.2, 0.18, 0.28);
  const padMat = type === 'armor' ? mats.dark : mats.sub;
  const padL = new THREE.Mesh(padGeo, padMat); padL.position.set(-0.4, 1.34, 0);
  const padR = new THREE.Mesh(padGeo, padMat); padR.position.set(0.4, 1.34, 0);
  parts.push(padL, padR);

  const fin = new THREE.Mesh(gCone(0.14, 0.36), mats.sub);
  fin.position.set(0, 1.5, 0.3); fin.rotation.x = Math.PI / 2.3;
  parts.push(fin);

  if (type === 'hoodie') {
    const hood = new THREE.Mesh(gSphere(0.26), mats.main);
    hood.scale.set(1, 0.7, 0.8); hood.position.set(0, 1.5, 0.22);
    const pocket = new THREE.Mesh(gBox(0.34, 0.16, 0.06), mats.dark);
    pocket.position.set(0, 0.98, -0.32);
    parts.push(hood, pocket);
  } else if (type === 'armor') {
    const plate = new THREE.Mesh(gBox(0.5, 0.42, 0.14), mats.dark);
    plate.position.set(0, 1.16, -0.28);
    const belt = new THREE.Mesh(gBox(0.56, 0.1, 0.36), mats.sub);
    belt.position.set(0, 0.82, 0);
    parts.push(plate, belt);
  } else if (type === 'tech') {
    const strap = new THREE.Mesh(gBox(0.1, 0.5, 0.4), mats.sub);
    strap.position.set(-0.16, 1.1, 0); strap.rotation.z = 0.25;
    parts.push(strap);
    for (let i = 0; i < 2; i++) {
      const pouch = new THREE.Mesh(gBox(0.12, 0.12, 0.1), mats.dark);
      pouch.position.set(0.18 - 0.36 * i, 0.8, -0.28);
      parts.push(pouch);
    }
  } else { // light (speed)
    const stripe = new THREE.Mesh(gBox(0.08, 0.5, 0.06), mats.sub);
    stripe.position.set(0, 1.12, -0.34);
    const collar = new THREE.Mesh(gBox(0.4, 0.1, 0.36), mats.sub);
    collar.position.set(0, 1.4, 0);
    parts.push(stripe, collar);
  }

  return parts;
}

export function createEnemyAccessories(cfg, mats) {
  const parts = [];
  if (!cfg.hasHeadgear) return parts;

  const hr = cfg.headRadius;
  const hy = cfg.headY;
  const eyeZ = -(hr * 0.86);

  switch (cfg.accessoryType) {
    case 'goggles': {
      const band = new THREE.Mesh(gCyl(hr * 1.02, hr * 1.02, 0.12), mats.dark);
      band.rotation.x = Math.PI / 2; band.position.set(0, hy + 0.03, 0);
      const lensGeo = gBox(0.16, 0.12, 0.05);
      const lL = new THREE.Mesh(lensGeo, mats.glass); lL.position.set(-0.12, hy + 0.03, eyeZ - 0.02);
      const lR = new THREE.Mesh(lensGeo, mats.glass); lR.position.set(0.12, hy + 0.03, eyeZ - 0.02);
      parts.push(band, lL, lR);
      break;
    }
    case 'cap': {
      const dome = new THREE.Mesh(gSphere(0.3), mats.sub);
      dome.scale.set(hr / 0.3 * 1.05, hr / 0.3 * 0.6, hr / 0.3 * 1.05);
      dome.position.set(0, hy + hr * 0.5, 0.02);
      const brim = new THREE.Mesh(gBox(0.34, 0.05, 0.24), mats.dark);
      brim.position.set(0, hy + hr * 0.42, -hr * 0.9);
      parts.push(dome, brim);
      break;
    }
    case 'helmet': {
      const dome = new THREE.Mesh(gSphere(0.3), mats.main);
      dome.scale.set(hr / 0.3 * 1.12, hr / 0.3 * 0.96, hr / 0.3 * 1.12);
      dome.position.set(0, hy + hr * 0.35, 0);
      const ridge = new THREE.Mesh(gBox(0.08, 0.24, 0.5), mats.dark);
      ridge.position.set(0, hy + hr * 0.7, 0);
      const earGeo = gBox(0.1, 0.18, 0.18);
      const eL = new THREE.Mesh(earGeo, mats.dark); eL.position.set(-hr * 1.05, hy, 0);
      const eR = new THREE.Mesh(earGeo, mats.dark); eR.position.set(hr * 1.05, hy, 0);
      parts.push(dome, ridge, eL, eR);
      break;
    }
    case 'visor': {
      // Deliberately asymmetric single visor for the "technical" archetype.
      const visor = new THREE.Mesh(gBox(0.42, 0.1, 0.06), mats.glass);
      visor.position.set(0.05, hy + 0.04, eyeZ - 0.02); visor.rotation.z = 0.06;
      const mount = new THREE.Mesh(gBox(0.08, 0.14, 0.14), mats.dark);
      mount.position.set(hr * 0.95, hy + 0.04, 0);
      parts.push(visor, mount);
      break;
    }
  }

  // Optional headphones (speed archetype only) — ear cups + a top band.
  if (cfg.headphones) {
    const cupGeo = gBox(0.1, 0.2, 0.2);
    const cL = new THREE.Mesh(cupGeo, mats.dark); cL.position.set(-hr * 1.02, hy, 0);
    const cR = new THREE.Mesh(cupGeo, mats.dark); cR.position.set(hr * 1.02, hy, 0);
    const bandTop = new THREE.Mesh(gCyl(hr * 1.05, hr * 1.05, 0.06), mats.dark);
    bandTop.rotation.z = Math.PI / 2; bandTop.position.set(0, hy + hr * 0.85, 0);
    parts.push(cL, cR, bandTop);
  }

  return parts;
}

// -------------------------------------------------------------- assembly
/**
 * Populate an existing rig Group from a config: builds a scaled body-root,
 * runs every part builder into it, and returns the fresh material array.
 * Shared by both first-time construction and runtime appearance swaps so the
 * two paths can never drift apart.
 */
export function populateEnemyRig(rig, cfg) {
  const materials = [];
  const mats = applyEnemyPalette(cfg, materials);

  // bodyScale is applied to an inner root so it never fights the crouch offset
  // the base Character writes onto rig.position.y.
  const root = new THREE.Group();
  root.scale.fromArray(cfg.bodyScale);
  rig.add(root);

  const add = (arr) => { for (const m of arr) root.add(m); };
  add(createEnemyBody(cfg, mats));
  add(createEnemyHead(cfg, mats));
  add(createEnemyTentacleHair(cfg, mats));
  add(createEnemyOutfit(cfg, mats));
  add(createEnemyAccessories(cfg, mats));

  return materials;
}

/** Build a full { group, rig, materials } trio in the shape Character expects. */
export function createEnemyCharacter(cfg) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const materials = populateEnemyRig(rig, cfg);
  return { group, rig, materials };
}

/** Dispose only per-instance materials — geometries are shared/cached. */
export function disposeEnemyMaterials(materials) {
  if (!materials) return;
  for (const m of materials) m.dispose();
}
