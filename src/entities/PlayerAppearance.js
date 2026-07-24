import * as THREE from 'three';
import {
  applyEnemyPalette,
  createEnemyBody,
  createEnemyHead,
  createEnemyTentacleHair,
  createEnemyOutfit,
} from './EnemyAppearance.js';

// A fixed protagonist identity: bright team-blue tentacles, a warm skin tone,
// lime details and dark streetwear. The proportions and visual vocabulary are
// squid-sport inspired while remaining an original CHROMA DUEL character.
const PLAYER_STYLE = {
  id: 'chroma-rider',
  name: 'CHROMA RIDER',
  bodyScale: [1, 1, 1],
  outfitType: 'light',
  accessoryType: 'mask',
  main: '#2FB8FF',
  sub: '#C8FF32',
  dark: '#172033',
  skin: '#F19A78',
  eyeColor: '#121820',
  shoeColor: '#F4F7FF',
  headRadius: 0.34,
  headY: 1.69,
  hasHeadgear: false,
  headphones: false,
  hair: {
    type: 'long',
    count: 8,
    length: 0.62,
    thick: 0.105,
    asym: true,
  },
  expression: 'fierce',
  eyeTilt: 0.18,
  browTilt: 0.34,
  showBrows: false,
};

function addOwnedMesh(parent, geometry, material, ownedGeometries) {
  ownedGeometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

function makeExtraMaterial(materials, color, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.52,
    metalness: 0.12,
    ...options,
  });
  materials.push(material);
  return material;
}

/**
 * Build the protagonist's cosmetic rig.
 *
 * Shared cached humanoid geometries come from EnemyAppearance, while all
 * protagonist-only shapes are tracked separately so Player can dispose them
 * without invalidating the CPU's shared geometry cache.
 */
export function createPlayerCharacter() {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  const motionRoot = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const headGroup = new THREE.Group();
  const hairGroup = new THREE.Group();
  const gearGroup = new THREE.Group();
  const ownedGeometries = [];
  const materials = [];

  group.add(rig);
  rig.add(motionRoot);
  motionRoot.add(bodyGroup, headGroup, hairGroup, gearGroup);

  const mats = applyEnemyPalette(PLAYER_STYLE, materials);
  const [
    hips,
    legL,
    legR,
    shoeL,
    shoeR,
    torso,
    armL,
    armR,
    handL,
    handR,
  ] = createEnemyBody(PLAYER_STYLE, mats);

  // Re-parent limbs under anatomical pivots. The shared appearance builder
  // returns parts in feet-origin space, so preserve their world positions by
  // subtracting each new joint's position before attaching them.
  const legLPivot = new THREE.Group();
  const legRPivot = new THREE.Group();
  const armLPivot = new THREE.Group();
  const armRPivot = new THREE.Group();
  legLPivot.position.set(-0.16, 0.7, 0);
  legRPivot.position.set(0.16, 0.7, 0);
  armLPivot.position.set(-0.4, 1.36, 0);
  armRPivot.position.set(0.4, 1.36, 0);

  legL.position.sub(legLPivot.position);
  shoeL.position.sub(legLPivot.position);
  legR.position.sub(legRPivot.position);
  shoeR.position.sub(legRPivot.position);
  armL.position.sub(armLPivot.position);
  handL.position.sub(armLPivot.position);
  armR.position.sub(armRPivot.position);
  handR.position.sub(armRPivot.position);

  legLPivot.add(legL, shoeL);
  legRPivot.add(legR, shoeR);
  armLPivot.add(armL, handL);
  armRPivot.add(armR, handR);
  bodyGroup.add(hips, torso, legLPivot, legRPivot, armLPivot, armRPivot);

  for (const mesh of createEnemyHead(PLAYER_STYLE, mats)) headGroup.add(mesh);
  for (const mesh of createEnemyTentacleHair(PLAYER_STYLE, mats)) hairGroup.add(mesh);
  for (const mesh of createEnemyOutfit(PLAYER_STYLE, mats)) bodyGroup.add(mesh);

  // A complete blue shell guarantees that the shoulder camera never exposes a
  // bare rear scalp. The skin-coloured face is layered only on the front.
  const scalp = addOwnedMesh(
    headGroup,
    new THREE.SphereGeometry(0.355, 16, 12),
    mats.main,
    ownedGeometries,
  );
  scalp.position.set(0, PLAYER_STYLE.headY + 0.01, 0.005);
  scalp.scale.set(1.03, 1.02, 1.03);

  const facePlate = addOwnedMesh(
    headGroup,
    new THREE.SphereGeometry(0.285, 14, 10),
    mats.skin,
    ownedGeometries,
  );
  facePlate.position.set(0, PLAYER_STYLE.headY - 0.025, -0.345);
  facePlate.scale.set(1.08, 0.82, 0.12);

  // Tapered fringe pieces overlap the cap and flow over the forehead. Their
  // uneven lengths keep the silhouette organic while leaving both eyes clear.
  const fringeSpecs = [
    { x: -0.16, y: 1.87, length: 0.29, tilt: -0.42 },
    { x: 0, y: 1.92, length: 0.2, tilt: 0 },
    { x: 0.16, y: 1.87, length: 0.28, tilt: 0.42 },
  ];
  for (const spec of fringeSpecs) {
    const fringe = addOwnedMesh(
      hairGroup,
      new THREE.CylinderGeometry(0.09, 0.028, spec.length, 8),
      mats.main,
      ownedGeometries,
    );
    fringe.position.set(spec.x, spec.y, -0.37);
    fringe.rotation.z = spec.tilt;
    fringe.rotation.x = -0.12;
  }

  const maskMat = makeExtraMaterial(materials, '#171824', {
    roughness: 0.35,
    metalness: 0.08,
  });
  const mouthMat = makeExtraMaterial(materials, '#8C314E', { roughness: 0.75 });
  const eyeWhiteMat = makeExtraMaterial(materials, '#FFF36A', {
    emissive: '#514A08',
    emissiveIntensity: 0.55,
    roughness: 0.28,
  });
  const tankMat = makeExtraMaterial(materials, '#1568A8', {
    roughness: 0.28,
    metalness: 0.48,
  });
  const inkMat = makeExtraMaterial(materials, PLAYER_STYLE.main, {
    emissive: '#073C62',
    emissiveIntensity: 0.45,
    roughness: 0.24,
    metalness: 0.2,
  });
  const metalMat = makeExtraMaterial(materials, '#DCEBFA', {
    roughness: 0.22,
    metalness: 0.72,
  });

  // Two overlapping rounded mask lobes frame the existing sharp eyes.
  const maskGeometry = new THREE.SphereGeometry(0.18, 14, 10);
  ownedGeometries.push(maskGeometry);
  for (const side of [-1, 1]) {
    const lobe = new THREE.Mesh(maskGeometry, maskMat);
    lobe.scale.set(1.06, 0.46, 0.14);
    lobe.position.set(side * 0.13, PLAYER_STYLE.headY + 0.015, -0.382);
    lobe.rotation.z = side * -0.12;
    headGroup.add(lobe);
  }

  const eyeGeometry = new THREE.SphereGeometry(0.09, 12, 8);
  const pupilGeometry = new THREE.SphereGeometry(0.04, 10, 8);
  ownedGeometries.push(eyeGeometry, pupilGeometry);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeWhiteMat);
    eye.scale.set(1.05, 0.42, 0.14);
    eye.position.set(side * 0.125, PLAYER_STYLE.headY + 0.018, -0.402);
    eye.rotation.z = side * -0.17;
    headGroup.add(eye);

    const pupil = new THREE.Mesh(pupilGeometry, mats.eye);
    pupil.scale.set(0.42, 0.9, 0.16);
    pupil.position.set(side * 0.115, PLAYER_STYLE.headY + 0.017, -0.418);
    pupil.rotation.z = side * -0.17;
    headGroup.add(pupil);
  }

  // Pointed fin-ears immediately make the silhouette read as an ink creature.
  const earGeometry = new THREE.ConeGeometry(0.115, 0.34, 5);
  ownedGeometries.push(earGeometry);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeometry, mats.skin);
    ear.position.set(side * 0.37, PLAYER_STYLE.headY + 0.005, 0);
    ear.rotation.z = side * -Math.PI / 2;
    headGroup.add(ear);
  }

  const mouth = addOwnedMesh(
    headGroup,
    new THREE.BoxGeometry(0.12, 0.025, 0.025),
    mouthMat,
    ownedGeometries,
  );
  mouth.position.set(0.035, PLAYER_STYLE.headY - 0.17, -0.393);
  mouth.rotation.z = -0.08;

  // Opaque ink tank with a bright liquid core and top/bottom metal collars.
  const tank = new THREE.Group();
  tank.position.set(0, 1.16, 0.37);
  const tankShell = addOwnedMesh(
    tank,
    new THREE.CylinderGeometry(0.18, 0.2, 0.58, 12),
    tankMat,
    ownedGeometries,
  );
  const tankCore = addOwnedMesh(
    tank,
    new THREE.CylinderGeometry(0.13, 0.15, 0.43, 12),
    inkMat,
    ownedGeometries,
  );
  tankCore.position.z = 0.035;
  for (const y of [-0.27, 0.27]) {
    const collar = addOwnedMesh(
      tank,
      new THREE.CylinderGeometry(0.205, 0.205, 0.07, 12),
      metalMat,
      ownedGeometries,
    );
    collar.position.y = y;
  }
  gearGroup.add(tank);

  // Chunky right-hand shooter aligned with CameraController's shoulder muzzle.
  const shooter = new THREE.Group();
  shooter.position.set(0.39, 1.19, -0.36);
  const body = addOwnedMesh(
    shooter,
    new THREE.BoxGeometry(0.22, 0.2, 0.56),
    mats.dark,
    ownedGeometries,
  );
  body.position.z = -0.12;
  const chamber = addOwnedMesh(
    shooter,
    new THREE.CylinderGeometry(0.13, 0.13, 0.26, 10),
    inkMat,
    ownedGeometries,
  );
  chamber.rotation.z = Math.PI / 2;
  chamber.position.set(0, 0.03, -0.13);
  const nozzle = addOwnedMesh(
    shooter,
    new THREE.CylinderGeometry(0.055, 0.085, 0.39, 10),
    metalMat,
    ownedGeometries,
  );
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = -0.53;
  const grip = addOwnedMesh(
    shooter,
    new THREE.BoxGeometry(0.12, 0.28, 0.13),
    maskMat,
    ownedGeometries,
  );
  grip.position.set(0, -0.2, -0.05);
  gearGroup.add(shooter);

  // Lime sole blocks give the white sneakers a vivid sports-game read.
  const soleGeometry = new THREE.BoxGeometry(0.28, 0.055, 0.44);
  ownedGeometries.push(soleGeometry);
  for (const side of [-1, 1]) {
    const sole = new THREE.Mesh(soleGeometry, mats.sub);
    sole.position.set(side * 0.16, 0.025, -0.075);
    const legPivot = side < 0 ? legLPivot : legRPivot;
    sole.position.sub(legPivot.position);
    legPivot.add(sole);
  }

  group.userData.appearanceParts = {
    motionRoot,
    hairGroup,
    gearGroup,
    shooter,
    tank,
    legLPivot,
    legRPivot,
    armLPivot,
    armRPivot,
    shoeL,
    shoeR,
  };
  group.userData.ownedGeometries = ownedGeometries;

  return { group, rig, materials };
}
