// ============================================================================
// CHROMA DUEL - Central configuration
// All tunable gameplay numbers live here so balance changes never require
// hunting through class internals.
// ============================================================================

export const TEAM = {
  PLAYER: 'player',
  CPU: 'cpu',
};

export const COLORS = {
  player: 0x2fb8ff,
  playerDeep: 0x0f6fb8,
  cpu: 0xff7a2f,
  cpuDeep: 0xc2470c,
  neutral: 0x3c4452,
  floorBase: 0x6d7a8e, // deliberately desaturated so player/CPU ink stays the most saturated thing on screen
  wall: 0x18213a,
  obstacle: 0x232f4d,
  platform: 0x27324f,
  ramp: 0x2a3552,
  climbPanel: 0xffd94a, // distinct warm tone marks a wall as "paintable / climbable"
  climbPanelBase: 0x2c2410,
};

// "Neon marine arena" theme palette — used by structural surface textures,
// the background environment and stage decorations. Kept separate from
// COLORS (which also drives gameplay-relevant reads like ink hues) so art
// direction can be retuned here without touching anything logic-facing.
export const THEME = {
  neonCyan: 0x35e6ff,
  neonPurple: 0xb15bff,
  neonYellow: 0xffd94a,
  neonOrange: 0xff8a3d,
  neonWhite: 0xf3f8ff,
  navyDeep: 0x0a1128,
  navyMid: 0x172140,
  skyTop: 0x0a1230,
  skyHorizon: 0x8fe0ff,
  seaColor: 0x0c3450,
  seaHighlight: 0x3fd2e8,
  fogColor: 0x2c4d78,
};

// Tunable knobs for the purely-decorative background/environment/prop layer
// (see StageDecor). None of these values are read by gameplay, AI, or paint
// logic — safe to retune for art direction or mobile performance.
export const DECOR = {
  // Sky + sea
  skyDomeRadius: 150,
  seaRadius: 230,
  seaY: -2.6,
  seaScrollSpeed: 0.015,

  // Clouds (InstancedMesh)
  cloudCount: 10,
  cloudCountLow: 5,
  cloudHeight: 46,
  cloudSpread: 130,
  cloudDriftSpeed: 0.35,

  // Distant skyline silhouettes (no colliders, no shadows)
  distantIslandCount: 4,
  distantTowerCount: 5,
  distantRadius: 120,

  // Animated props (kept to a handful per the mobile perf budget)
  shipSpeed: 2.0,
  droneCount: 2,
  droneCountLow: 1,
  droneOrbitRadius: 27,
  droneOrbitSpeed: 0.18,
  droneHeight: 9,
  flagCount: 4,
  signBlinkSpeed: 1.6,

  // Perimeter dressing
  buoyCount: 14,
  perimeterLightCount: 16,

  // Central landmark ("energy core" + rotating neon ring)
  landmarkHeight: 5.6,
  landmarkRingRadius: 2.1,
  landmarkCoreRadius: 0.85,
  landmarkRotateSpeed: 0.35,
  landmarkRingRotateSpeed: -0.22,
  landmarkBobAmplitude: 0.28,
  landmarkBobSpeed: 0.9,

  emissiveIntensity: 1.4,
};

export const MATCH = {
  durationSec: 90,
  countdownSec: 3,
  startFlashSec: 0.6,
  finalCountdownSec: 10,
  judgingDelaySec: 1.4,
  respawnDelaySec: 3,
  invincibleSec: 1.5,
};

export const ARENA = {
  width: 44,
  depth: 44,
  wallHeight: 6,
  platformHeight: 2.6,
  platformSize: 14, // bigger central objective raises its control value
  rampWidth: 5,
  rampLength: 7,
  rampOffsetX: 2.2, // ramp's X offset from platform center; shared with PaintSystem's floor-pattern overlay
  climbPanelWidth: 4.2, // width of each paintable/climbable wall section
  spawnSafeRadius: 3.6, // pre-inked safe zone painted around each spawn point
};

export const PAINT = {
  gridResolution: 128, // cells per axis for the coverage grid (independent of visual texture)
  textureSize: 512, // canvas texture pixel resolution
  splatRadius: 2.1, // world-units radius painted per projectile hit
  koSplatRadius: 3.4, // large burst painted by the attacker when an opponent is splatted
  updateIntervalMs: 45, // throttle canvas texture upload
  splatterMin: 7, // tiny random flecks around each impact
  splatterMax: 13,
  glossLifeSec: 2.2, // temporary wet sheen duration for fresh ink
  trailRadius: 0.42, // thin paint ribbon stamped by grounded movement
  trailIntervalSec: 0.08,
  wallGridCols: 12, // small independent coverage grid for each climbable wall panel
  wallGridRows: 10,
  wallTextureSize: 128,
  wallPathToleranceCols: 1, // how far a climb path may bend sideways between adjacent grid rows
};

export const MOVEMENT = {
  walkSpeed: 6.4,
  inkSurfSpeedMult: 1.8,
  inkSurfFovBoost: 8, // widens the camera while ink-surfing for a stronger speed feel
  inkSurfFovLerp: 8.5, // how quickly the FOV eases into/out of surf mode
  inkSurfCameraSink: 0.82, // lowers the first-person camera while submerged in own ink
  inkSurfBodySink: -1.05, // pulls the character rig below the floor for a true dive silhouette
  inkSurfHitboxHeight: 0.62, // smaller target while fully submerged
  inkSurfStillSpeed: 0.45, // below this horizontal speed the character is considered concealed
  inkSurfMovingOpacity: 0.34, // moving swimmers remain readable through ripples / a faint silhouette
  inkSurfStillOpacity: 0.08,
  inkSurfExitCooldownSec: 0.12,
  inkSurfExitHopSpeed: 3.2, // small pop upward when releasing surf on own ink
  inkRollSpeed: 10.8,
  inkRollJumpSpeed: 4.6,
  inkRollDurationSec: 0.42,
  inkRollCooldownSec: 0.85,
  inkRollArmorMultiplier: 0.4,
  inkRollFovBoost: 12,
  enemyPaintSlowMult: 0.62,
  airControl: 0.35,
  jumpSpeed: 7.4,
  gravity: -20,
  groundAcceleration: 40,
  airAcceleration: 12,
  friction: 10,
  capsuleRadius: 0.45,
  capsuleHeight: 1.7,
  maxFallSpeed: -30,
  wallClimbSpeed: 5.6, // vertical speed while scaling a painted climb panel
  wallClimbMaxDurationSec: 1.35, // hard cap so a climb always resolves quickly
  wallClimbApproachDist: 0.85, // how far from a panel's plane still counts as "touching" it
  wallClimbInkCostPerSec: 32, // ink drained per second while climbing
  wallClimbMountInward: 0.9, // nudge onto the ledge once a climb reaches the top
};

export const ENEMY_FLOOR_EFFECT = {
  damagePerSecond: 6,
  tickIntervalSec: 0.5,
};

export const HEALTH = {
  max: 100,
  regenDelaySec: 3.0,
  regenPerSec: 14,
  regenDiveMultiplier: 2,
};

export const INK = {
  max: 100,
  regenOwnFloor: 14, // per second
  regenSurf: 26, // per second while ink-surfing
  regenNeutral: 4,
  regenEnemyFloor: 0,
  regenAirborneOrNoFloor: 5,
};

export const WEAPON = {
  defaultType: 'stream',
  fireInterval: 0.16, // seconds between shots
  costPerShot: 6,
  projectileSpeed: 34,
  projectileRadius: 0.16,
  maxRange: 40,
  maxLifeSec: 2.2,
  damage: 9,
  spreadRad: 0.018,
  recoilKick: 0.02,
  profiles: {
    stream: {
      name: 'STREAM',
      fireInterval: 0.16,
      costPerShot: 6,
      projectileSpeed: 34,
      projectileRadius: 0.16,
      maxRange: 40,
      maxLifeSec: 2.2,
      damage: 9,
      spreadRad: 0.018,
      pelletCount: 1,
      paintRadius: 2.1,
    },
    spread: {
      name: 'SPREAD',
      fireInterval: 0.52,
      costPerShot: 16,
      projectileSpeed: 27,
      projectileRadius: 0.18,
      maxRange: 24,
      maxLifeSec: 1.15,
      damage: 6,
      spreadRad: 0.12,
      pelletCount: 5,
      paintRadius: 1.45,
    },
    precision: {
      name: 'PRECISION',
      fireInterval: 0.88,
      costPerShot: 18,
      projectileSpeed: 54,
      projectileRadius: 0.13,
      maxRange: 55,
      maxLifeSec: 1.2,
      damage: 38,
      spreadRad: 0.004,
      pelletCount: 1,
      paintRadius: 1.35,
      charge: {
        durationSec: 0.95,
        storeDurationSec: 1.6,
        minInkCost: 7,
        fullInkCost: 24,
        minProjectileSpeed: 34,
        fullProjectileSpeed: 78,
        minProjectileRadius: 0.11,
        fullProjectileRadius: 0.19,
        minRange: 23,
        fullRange: 68,
        minDamage: 12,
        fullDamage: 105,
        minSpreadRad: 0.035,
        fullSpreadRad: 0.001,
        minPaintRadius: 1.05,
        fullPaintRadius: 2.65,
        minLineRadius: 0.24,
        fullLineRadius: 0.58,
        minLineSpacing: 0.72,
        fullLineSpacing: 0.48,
        minLineDrop: 2.6,
        fullLineDrop: 5.2,
        minWallLineLength: 1.4,
        fullWallLineLength: 5.8,
        minFireInterval: 0.36,
        fullFireInterval: 0.72,
      },
    },
  },
};

export const SUB_WEAPON = {
  cooldownSec: 1.1,
  cost: 28,
  projectileSpeed: 22,
  projectileRadius: 0.28,
  maxRange: 28,
  maxLifeSec: 1.7,
  damage: 26,
  paintRadius: 3.5,
  gravity: -11,
};

export const PROJECTILE_POOL = {
  size: 48,
};

export const PARTICLES = {
  poolSize: 260,
  splatCount: 6,
  splatLifeSec: 0.45,
  koCount: 26,
  koLifeSec: 0.9,
  trailCount: 2,
  trailLifeSec: 0.35,
};

export const SPECIAL = {
  maxCharge: 100,
  cellsPerCharge: 95, // roughly 12-18 seconds of productive painting
  durationSec: 1.15,
  pulseIntervalSec: 0.16,
  minRadius: 2.4,
  maxRadius: 8.2,
  damage: 36,
};

export const CAMERA = {
  eyeHeight: 1.75, // camera height above the character's feet (first-person view)
  minPitch: -1.4,
  maxPitch: 1.4,
  sensitivity: 0.0022,
};

export const AI = {
  decisionIntervalMin: 0.25,
  decisionIntervalMax: 0.5,
  reactionDelaySec: 0.25,
  aimJitterBase: 0.03,
  aimJitterPerMeter: 0.0035,
  leadPredictionChance: 0.4,
  attackRange: 22,
  fleeHpThreshold: 28,
  refillInkThreshold: 22,
  visionHalfAngle: Math.PI, // CPU "senses" rather than strict FOV in v1
  moveSpeedMult: 1.0,
  routeProbeDist: 3.4,
  ownInkRouteBonus: 0.85,
  enemyInkRoutePenalty: 1.35,
  climbPlanInitialDelaySec: 3.5,
  climbPlanChance: 0.42,
  climbPlanDurationSec: 9,
  climbPlanCooldownSec: 8,
  climbMinInk: 44,
  climbApproachOffset: 0.72,
  spreadWeaponRange: 7,
  precisionWeaponRange: 14,
  weaponRangeHysteresis: 1.5,
  weaponSwitchCooldownSec: 1.2,
  bombMinRange: 5,
  bombMaxRange: 19,
  bombInkReserve: 12,
  bombDecisionCooldownSec: 6,
  bombPressureChance: 0.08,
  bombHighGroundDelta: 0.9,
  bombHorizontalSpeed: 15.5,
  bombMinFlightSec: 0.85,
  specialChargeMultiplier: 3,
  specialWindupSec: 0.75,
  specialEngageRange: 10,
  specialCloseRange: 6,
  specialLowHpThreshold: 55,
  specialCoverageDeficitPct: 5,
  specialDecisionCooldownSec: 4,
};

export const AI_DIFFICULTY = Object.freeze({
  rookie: Object.freeze({
    id: 'rookie',
    label: 'ROOKIE',
    reactionDelay: 0.42,
    aimJitterMult: 1.65,
    decisionIntervalMult: 1.3,
    moveSpeedMult: 0.9,
    bombPressureMult: 0.55,
    specialChargeMult: 0.72,
  }),
  standard: Object.freeze({
    id: 'standard',
    label: 'STANDARD',
    reactionDelay: AI.reactionDelaySec,
    aimJitterMult: 1,
    decisionIntervalMult: 1,
    moveSpeedMult: 1,
    bombPressureMult: 1,
    specialChargeMult: 1,
  }),
  elite: Object.freeze({
    id: 'elite',
    label: 'ELITE',
    reactionDelay: 0.14,
    aimJitterMult: 0.62,
    decisionIntervalMult: 0.72,
    moveSpeedMult: 1.08,
    bombPressureMult: 1.65,
    specialChargeMult: 1.28,
  }),
});

export const DEBUG_DEFAULTS = {
  showFps: false,
  showAiState: false,
  showColliders: false,
  showAiTarget: false,
  showPaintGrid: false,
  showCurrentCell: false,
  showInvincibility: false,
};

export const TOUCH = {
  joystickMaxRadius: 50, // px the nub can travel from its center before clamping
  joystickDeadzone: 0.35, // fraction of max radius before a direction registers
  lookSensitivityMult: 1.3, // extra multiplier on top of CAMERA.sensitivity for drag-to-look
};

export const PERF = {
  maxDeltaSec: 1 / 20, // clamp large frame gaps (tab switch, etc.)
  pixelRatioCap: 1.75,
};
