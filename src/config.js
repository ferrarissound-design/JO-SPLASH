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
  floorBase: 0x586475,
  wall: 0x7a879b,
  obstacle: 0x8a96a8,
  platform: 0xa2adbd,
  ramp: 0x949faf,
  climbPanel: 0xf3c14b, // distinct warm tone marks a wall as "paintable / climbable"
  climbPanelBase: 0x5a4a2e,
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
  platformSize: 14, // bigger central objective raises its control value
  rampWidth: 5,
  rampLength: 7,
  climbPanelWidth: 4.2, // width of each paintable/climbable wall section
  spawnSafeRadius: 3.6, // pre-inked safe zone painted around each spawn point
};

export const PAINT = {
  gridResolution: 128, // cells per axis for the coverage grid (independent of visual texture)
  textureSize: 512, // canvas texture pixel resolution
  splatRadius: 2.1, // world-units radius painted per projectile hit
  updateIntervalMs: 45, // throttle canvas texture upload
  splatterMin: 7, // tiny random flecks around each impact
  splatterMax: 13,
  glossLifeSec: 2.2, // temporary wet sheen duration for fresh ink
  trailRadius: 0.42, // thin paint ribbon stamped by grounded movement
  trailIntervalSec: 0.08,
  wallGridCols: 12, // small independent coverage grid for each climbable wall panel
  wallGridRows: 10,
  wallTextureSize: 128,
  wallOwnThreshold: 0.14, // fraction of a panel that must already be your own ink before you can climb it
};

export const MOVEMENT = {
  walkSpeed: 6.4,
  inkSurfSpeedMult: 1.8,
  inkSurfFovBoost: 8, // widens the camera while ink-surfing for a stronger speed feel
  inkSurfFovLerp: 8.5, // how quickly the FOV eases into/out of surf mode
  inkSurfCameraSink: 0.82, // lowers the first-person camera while submerged in own ink
  inkSurfBodySink: -1.05, // pulls the character rig below the floor for a true dive silhouette
  inkSurfExitCooldownSec: 0.12,
  inkSurfExitHopSpeed: 3.2, // small pop upward when releasing surf on own ink
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
