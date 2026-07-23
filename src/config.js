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
  neutral: 0x313845,
  floorBase: 0x465061,
  wall: 0x667286,
  obstacle: 0x778398,
  platform: 0x929daf,
  ramp: 0x828da0,
};

export const MATCH = {
  durationSec: 90,
  countdownSec: 3,
  startFlashSec: 0.6,
  respawnDelaySec: 3,
  invincibleSec: 1.5,
};

export const ARENA = {
  width: 44,
  depth: 44,
  wallHeight: 6,
  platformHeight: 2.6,
  platformSize: 11,
  rampWidth: 5,
  rampLength: 7,
};

export const PAINT = {
  gridResolution: 128, // cells per axis for the coverage grid (independent of visual texture)
  textureSize: 512, // canvas texture pixel resolution
  splatRadius: 2.1, // world-units radius painted per projectile hit
  updateIntervalMs: 45, // throttle canvas texture upload
};

export const MOVEMENT = {
  walkSpeed: 6.4,
  inkSurfSpeedMult: 1.55,
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
};

export const ENEMY_FLOOR_EFFECT = {
  damagePerSecond: 6,
  tickIntervalSec: 0.5,
};

export const HEALTH = {
  max: 100,
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
  fireInterval: 0.16, // seconds between shots
  costPerShot: 6,
  projectileSpeed: 34,
  projectileRadius: 0.16,
  maxRange: 40,
  maxLifeSec: 2.2,
  damage: 9,
  spreadRad: 0.018,
  recoilKick: 0.02,
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
};

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
