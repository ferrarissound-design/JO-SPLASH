import * as THREE from 'three';
import {
  MATCH, TEAM, COLORS, THEME, PERF, MOVEMENT, CAMERA, ARENA, PAINT, AI, AI_DIFFICULTY, GEAR_POWERS,
} from '../config.js';
import { InputManager } from './InputManager.js';
import { CameraController } from './CameraController.js';
import { TouchControls } from './TouchControls.js';
import { Settings } from './Settings.js';
import { MatchRecord } from './MatchRecord.js';
import { calculateBattleRank } from './BattleRank.js';
import { isSuddenDeathTie, getSuddenDeathLeader } from './SuddenDeath.js';
import { MATCH_RULES } from './MatchRules.js';
import { Progression, CHALLENGES } from './Progression.js';
import { DailyChallenges } from './DailyChallenges.js';
import { PlayerProfile } from './PlayerProfile.js';
import { TutorialController } from './TutorialController.js';
import { RuleController } from './RuleController.js';
import { CupController } from './CupController.js';
import { Arena, STAGES } from '../systems/Arena.js';
import { JumpPadSystem } from '../systems/JumpPadSystem.js';
import { StageDecor } from '../systems/StageDecor.js';
import { GadgetSystem } from '../systems/GadgetSystem.js';
import { PaintSystem } from '../systems/PaintSystem.js';
import { ProjectileManager } from '../systems/ProjectileManager.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Player } from '../entities/Player.js';
import { EnemyAI } from '../entities/EnemyAI.js';
import { UIManager } from '../ui/UIManager.js';
import { CharacterPreview } from '../ui/CharacterPreview.js';

const _enemyScreenPos = new THREE.Vector3();
const _enemyMarkerOffset = new THREE.Vector3(0, 2.35, 0);
const _damageCameraForward = new THREE.Vector3();
const _damageCameraRight = new THREE.Vector3();

/** Returns a screen-relative bearing: 0=front, +PI/2=right, PI=behind. */
export function calculateRelativeDirectionAngle(origin, source, forward, right) {
  const dx = source.x - origin.x;
  const dz = source.z - origin.z;
  if (Math.hypot(dx, dz) < 1e-6) return 0;
  const towardFront = dx * forward.x + dz * forward.z;
  const towardRight = dx * right.x + dz * right.z;
  return Math.atan2(towardRight, towardFront);
}

const STATE = {
  TITLE: 'title',
  RIVAL_INTRO: 'rivalIntro',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  JUDGING: 'judging',
  RESULT: 'result',
};

// ============================================================================
// Game — top-level orchestrator. Owns the single requestAnimationFrame loop,
// the title/countdown/playing/result state machine, and wiring between all
// subsystems. Individual systems stay ignorant of each other; Game is the
// only place that knows the full picture.
// ============================================================================
export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ui = new UIManager();

    this.settings = new Settings();
    this.settings.apply();
    this.matchRecord = new MatchRecord();
    this.progression = new Progression();
    this.dailyChallenges = new DailyChallenges();
    this.playerProfile = new PlayerProfile();
    this.tutorialController = new TutorialController();
    this.tutorialActive = false;
    this._tutorialStartPosition = new THREE.Vector3();
    this._tutorialPreviousPractice = false;
    this.selectedStageId = 'harbor';
    this.ruleController = new RuleController('turf');
    this.selectedRuleId = this.ruleController.ruleId;
    this.selectedSubWeaponId = 'bomb';
    this.selectedSpecialId = 'burst';
    this.selectedBattleMode = 'single';
    this.cupController = new CupController();
    this.cupSessionActive = false;
    this.settingsOpen = false;

    this._setupRenderer();
    this._setupScene();

    this.arena = new Arena(this.selectedStageId);
    this.scene.add(this.arena.group);

    this.paintSystem = new PaintSystem(this.arena.halfWidth, this.arena.halfDepth);
    for (const mesh of this.arena.paintableFloorMeshes) this.paintSystem.applyToMaterial(mesh.material);

    this.input = new InputManager(this.canvas);
    this.settings.attachInput(this.input);
    this.touchControls = this.input.isTouch
      ? new TouchControls(this.input, document.getElementById('touch-controls'))
      : null;
    this.ui.applyTouchMode(this.input.isTouch);
    this.input.onGamepadConnectionChange = (connected, name) => {
      this.ui.setGamepadMode(connected, name);
    };
    this.input.updateGamepad(0);

    // Purely cosmetic background/landmark/prop layer. Lives in its own
    // scene-level group (see StageDecor's header comment) so it can never
    // affect hit-testing, collision, or AI pathing. `lowQuality` trims
    // instance counts on touch devices to protect mobile frame rate.
    this.stageDecor = new StageDecor(this.scene, this.arena, { lowQuality: this._isLowQuality() });

    this.cameraController = new CameraController(this.camera, this.arena);

    this.particleManager = new ParticleManager(this.scene);
    this.audioManager = new AudioManager();
    this.audioManager.setMasterVolume(this.settings.values.masterVolume);
    this.audioManager.setMusicVolume(this.settings.values.musicVolume);
    this.projectileManager = new ProjectileManager(
      this.scene, this.arena, this.paintSystem, this.particleManager, this.audioManager
    );
    this.jumpPadSystem = new JumpPadSystem(this.scene, this.arena.stage.jumpPads);
    this.projectileManager.onCharacterHit = (targetTeam, damage, hitPoint, metadata) => (
      this._onCharacterHit(targetTeam, damage, hitPoint, metadata)
    );
    this.gadgetSystem = new GadgetSystem(
      this.scene,
      this.arena,
      this.paintSystem,
      this.particleManager,
      this.audioManager,
      (targetTeam, damage, hitPoint, metadata) => this._onCharacterHit(targetTeam, damage, hitPoint, metadata),
    );
    this.gadgetSystem.attachProjectileManager(this.projectileManager);
    this.projectileManager.gadgetSystem = this.gadgetSystem;

    this.selectedCharacterId = 'default';
    this.player = new Player(
      this.arena.spawnPoints.player,
      this.cameraController,
      this.input,
      this.selectedCharacterId,
    );
    try {
      this.characterPreview = new CharacterPreview(
        document.getElementById('character-preview-canvas'),
        { lowQuality: this.input.isTouch },
      );
      this.characterPreview.setCharacter(this.selectedCharacterId);
    } catch {
      this.characterPreview = null;
      document.querySelector('.character-preview-panel')?.classList.add('preview-unavailable');
    }
    this.touchControls?.setWeaponType(this.player.weapon.type);
    this.selectedDifficulty = AI_DIFFICULTY[this.settings.values.difficultyId] ? this.settings.values.difficultyId : 'standard';
    this.practiceMode = false;
    this.cpu = new EnemyAI(this.arena.spawnPoints.cpu, AI_DIFFICULTY[this.selectedDifficulty]);
    this.projectileManager.onPaint = (team, paintedCells) => {
      if (team === TEAM.PLAYER) this.player.special.addCharge(paintedCells);
      else if (team === TEAM.CPU) {
        this.cpu.special.addCharge(
          paintedCells * AI.specialChargeMultiplier * this.cpu.difficulty.specialChargeMult
        );
      }
    };
    this.scene.add(this.player.mesh, this.cpu.mesh);
    this._setupCpuVisibilityAid();
    this._cpuHitFlashTimer = 0;

    this._faceSpawnPoints();

    this.state = STATE.TITLE;
    this.countdownRemaining = 0;
    this.judgingRemaining = 0;
    this.matchTimeRemaining = MATCH.durationSec;
    this.inSuddenDeath = false;
    this._suddenDeathForcedWinnerTeam = null;
    this.elapsedTime = 0;

    this.debugMode = false;
    this.ui.setDebugVisible(false);

    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fpsDisplay = 0;
    this._wasPlayerInkSurfing = false;

    this._bindUI();
    this.ui.setCharacter(
      this.selectedCharacterId,
      this.player.characterName,
      this.player.characterTagline,
    );
    this._selectDifficulty(this.selectedDifficulty);
    this._bindWindow();
    this.ui.updateMatchRecord(this.matchRecord);
    this.ui.setChallengeBoard(CHALLENGES, this.progression.unlocked);
    this.ui.setDailyChallengeBoard(this.dailyChallenges.todaysChallenges, this.dailyChallenges.completed);
    this.ui.setRewardLoadout(this.progression.availableRewards, this.progression.equipped);
    this.ui.setPlayerProfile(this.playerProfile.progress);
    this.ui.setRuleHint(MATCH_RULES[this.selectedRuleId]);
    this._updateCupProgressUI();
    this._applyRewardTheme();
    this._applyVisualSettings();
    this.input.onLockLost = () => this._pauseFromLockLoss();

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);

    // Exposed for manual QA in the browser console (e.g. `__game.debugMode = true`).
    window.__game = this;
    // Global debug helper, per spec: cycles the enemy's appearance type.
    window.cycleEnemyAppearance = () => this._cycleEnemyAppearance();
  }

  get cupActive() { return this.cupSessionActive && this.cupController.active; }
  get cupRound() { return this.cupController.round; }
  get cupWins() { return this.cupController.wins; }
  get zoneControl() { return this.ruleController.zone; }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(this._targetPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _isLowQuality() {
    const quality = this.settings.values.quality;
    return quality === 'low' || (quality === 'auto' && Boolean(this.input?.isTouch));
  }

  _targetPixelRatio() {
    const deviceRatio = window.devicePixelRatio || 1;
    if (this.settings.values.quality === 'low') return 1;
    if (this.settings.values.quality === 'high') return Math.min(deviceRatio, 2);
    return Math.min(deviceRatio, PERF.pixelRatioCap);
  }

  _applyVisualSettings({ rebuildDecor = false } = {}) {
    const {
      quality, colorMode, crosshairScale, touchLayout,
    } = this.settings.values;
    document.body.dataset.quality = quality;
    document.body.dataset.colorMode = colorMode;
    document.body.dataset.touchLayout = touchLayout;
    document.documentElement.style.setProperty('--crosshair-scale', String(crosshairScale));
    this.renderer?.setPixelRatio(this._targetPixelRatio());
    this._resizeViewport();
    if (rebuildDecor && this.arena && this.player && this.cpu) this._rebuildArena(this.selectedStageId);
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    // The actual sky is StageDecor's gradient dome; this background color is
    // just the fallback shown for the one frame before it's built, tuned to
    // match the dome's horizon stop so there's no visible pop-in.
    this.scene.background = new THREE.Color(THEME.skyHorizon);
    this.scene.fog = new THREE.Fog(THEME.fogColor, 55, 170);

    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 200);
    this._baseCameraFov = this.camera.fov;

    // Two lights total, per the "avoid stacking real-time lights" mobile
    // budget — everything else that reads as "glowing" is emissive
    // materials on the meshes themselves (see Arena/StageDecor), not extra
    // dynamic lights. Hemisphere sky/ground tints lean cyan/navy to match
    // the new arena palette; the directional key light is toned down
    // slightly since neon emissives now carry more of the visual "pop".
    const ambient = new THREE.HemisphereLight(0xbfe8ff, 0x16223f, 1.28);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff3d8, 1.05);
    sun.position.set(14, 22, 10);
    this.scene.add(sun);
  }

  _faceSpawnPoints() {
    const center = new THREE.Vector3(0, 0, 0);
    const pDir = center.clone().sub(this.player.position).setY(0).normalize();
    this.player.yaw = Math.atan2(-pDir.x, -pDir.z);
    this.cameraController.yaw = this.player.yaw;

    const cDir = center.clone().sub(this.cpu.position).setY(0).normalize();
    this.cpu.yaw = Math.atan2(-cDir.x, -cDir.z);
  }

  _bindUI() {
    this.ui.bindStart(() => this._beginSelectedMode());
    this.ui.bindRestart(() => this._continueFromResult());
    this.ui.bindCycleAppearance(() => this._cycleEnemyAppearance());
    this.ui.bindCharacterSelection((characterId) => this._selectCharacter(characterId));
    this.ui.bindDifficultySelection((difficultyId) => this._selectDifficulty(difficultyId));
    this.ui.bindPracticeModeChange((checked) => { this.practiceMode = checked; });
    this.ui.bindStageSelection((stageId) => this._selectStage(stageId));
    this.ui.bindRuleSelection((ruleId) => {
      this.selectedRuleId = this.ruleController.setRule(ruleId);
      this.ui.setRuleHint(MATCH_RULES[this.selectedRuleId]);
    });
    this.ui.bindSubWeaponSelection((subWeaponId) => {
      this.selectedSubWeaponId = subWeaponId;
      this.player.subWeapon.setType(subWeaponId);
      this.touchControls?.setSubWeaponType(subWeaponId);
    });
    this.ui.bindSpecialSelection((specialId) => {
      this.selectedSpecialId = specialId;
      this.player.special.setType(specialId);
      this.touchControls?.setSpecialType(specialId);
    });
    this.ui.bindBattleModeSelection((mode) => { this.selectedBattleMode = mode === 'cup' ? 'cup' : 'single'; });
    this.ui.bindResumeCup(() => this._resumeCup());
    this.ui.bindRewardSelection((rewardId) => {
      if (!this.progression.equip(rewardId)) return;
      this.ui.setRewardLoadout(this.progression.availableRewards, this.progression.equipped);
      this._applyRewardTheme();
    });
    this.ui.bindResume(() => this._resumeFromPause());
    this.ui.bindQuit(() => this._quitToTitle());
    this.ui.bindPause(() => this._pauseMatch());

    this.ui.bindOpenSettings(() => this._openSettings());
    this.ui.bindCloseSettings(() => this._closeSettings());
    this.ui.bindReplayTutorial(() => this._startTutorialFromSettings());
    this.ui.bindSkipTutorial(() => this._finishTutorial());
    this.ui.bindSensitivityChange((mult) => this.settings.setSensitivityMult(mult));
    this.ui.bindMasterVolumeChange((v) => {
      this.settings.setMasterVolume(v);
      this.audioManager.setMasterVolume(v);
    });
    this.ui.bindMusicVolumeChange((v) => {
      this.settings.setMusicVolume(v);
      this.audioManager.setMusicVolume(v);
    });
    this.ui.bindInvertYChange((checked) => this.settings.setInvertY(checked));
    this.ui.bindQualityChange((quality) => {
      this.settings.setQuality(quality);
      this._applyVisualSettings({ rebuildDecor: true });
    });
    this.ui.bindColorModeChange((colorMode) => {
      this.settings.setColorMode(colorMode);
      this._applyVisualSettings();
    });
    this.ui.bindCrosshairScaleChange((scale) => {
      this.settings.setCrosshairScale(scale);
      this._applyVisualSettings();
    });
    this.ui.bindTouchLayoutChange((layout) => {
      this.settings.setTouchLayout(layout);
      this._applyVisualSettings();
    });
    this.ui.bindKeybindButtons((action, button) => this._startKeyRebind(action, button));
    this.ui.bindResetKeybinds(() => {
      this.settings.resetKeyBindings();
      this.ui.updateKeybindLabels(this.settings.values.keyBindings);
    });
  }

  _beginSelectedMode() {
    if (this.state !== STATE.TITLE || this.settingsOpen) return;
    if (!this.playerProfile.tutorialComplete) {
      this._startTutorial();
      return;
    }
    this.cupSessionActive = this.selectedBattleMode === 'cup';
    if (this.cupSessionActive) {
      this.cupController.start();
      this._configureCupRound();
    } else {
      this.cpu.setRivalTactics();
    }
    this._startMatch();
  }

  _startTutorialFromSettings() {
    this.settingsOpen = false;
    this.ui.hideSettings();
    this._startTutorial();
  }

  _startTutorial() {
    this._tutorialPreviousPractice = this.practiceMode;
    this.practiceMode = true;
    this.ui.setPracticeMode(true);
    this.cupSessionActive = false;
    this.tutorialActive = true;
    this.tutorialController.start();
    this._startMatch();
    this.ui.hideTutorial();
    this.ui.clearStatusMessage();
  }

  _finishTutorial() {
    if (!this.tutorialActive) return;
    this.playerProfile.markTutorialComplete();
    this.tutorialController.stop();
    this.tutorialActive = false;
    this.practiceMode = this._tutorialPreviousPractice;
    this.ui.setPracticeMode(this.practiceMode);
    this.ui.hideTutorial();
    this.ui.hideCountdown();
    this.ui.hideRivalCard();
    this.ui.hideHUD();
    this.ui.hidePause();
    this.ui.hideResultScreen();
    this.audioManager.stopBattleBGM();
    this.audioManager.stopInkSurfLoop();
    this.touchControls?.hide();
    this.input.exitPointerLock();
    this.state = STATE.TITLE;
    this.ui.setPlayerProfile(this.playerProfile.progress);
    this.ui.showTitle();
  }

  _updateTutorialProgress() {
    if (!this.tutorialActive || !this.tutorialController.active) return;
    const result = this.tutorialController.update({
      movedDistance: this.player.position.distanceTo(this._tutorialStartPosition),
      shotsFired: this.player.shotsFired,
      airborne: this.player.position.y > 0.45,
      subWeaponsUsed: this.player.subWeaponsUsed,
      jumpPadAirborne: this.player.jumpPadAirborne,
    });
    if (result.completed) {
      this.ui.showStatusMessage('練習完了！', 1.2);
      this._finishTutorial();
      return;
    }
    if (result.advanced) {
      this.audioManager.playCountdownBeep();
      this.ui.showTutorialStep(result.step, this.tutorialController.progress);
    }
  }

  _continueFromResult() {
    if (this.cupActive && !this.cupController.isFinalRound) {
      this.cupController.advance();
      this._configureCupRound();
      this._startMatch();
      return;
    }
    if (this.cupActive && this.cupController.isFinalRound) {
      this.cupController.finish();
      this.cupSessionActive = false;
      this.state = STATE.TITLE;
      this.ui.hideResultScreen();
      this.ui.showTitle();
      this.ui.setRestartLabel('もう一度戦う (R)');
      this.ui.setCupSummary({ visible: false });
      this._updateCupProgressUI();
      return;
    }
    this._startMatch();
  }

  _configureCupRound() {
    const rival = this.cupController.currentRival;
    if (!rival) return;
    this._selectStage(rival.stageId);
    this._selectDifficulty(rival.difficultyId);
    this.cpu.applyAppearance(rival.appearanceType, { playIntro: false });
    this.cpu.setRivalTactics(rival.tactics);
    this._updateCupProgressUI();
  }

  _resumeCup() {
    const rival = this.cupController.resume();
    if (!rival) return;
    this.cupSessionActive = true;
    this.selectedBattleMode = 'cup';
    this.ui.setBattleMode('cup');
    this._configureCupRound();
    this._startMatch();
  }

  _updateCupProgressUI() {
    const rival = this.cupController.currentRival;
    this.ui.setCupProgress({
      visible: this.cupActive || this.cupController.resumeAvailable,
      round: this.cupController.round,
      wins: this.cupController.wins,
      rival,
      resumeAvailable: !this.cupSessionActive && this.cupController.resumeAvailable,
    });
  }

  _selectStage(stageId) {
    const nextId = STAGES[stageId] ? stageId : 'harbor';
    this.ui.setStage(nextId);
    if (nextId === this.selectedStageId) return;
    this.selectedStageId = nextId;
    this._rebuildArena(nextId);
  }

  _disposeObjectTree(root) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    root?.traverse((obj) => {
      if (obj.geometry) geometries.add(obj.geometry);
      const objectMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of objectMaterials) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value?.isTexture && typeof value.dispose === 'function') textures.add(value);
        }
      }
    });
    for (const texture of textures) {
      if (typeof texture?.dispose === 'function') texture.dispose();
    }
    for (const material of materials) {
      if (typeof material?.dispose === 'function') material.dispose();
    }
    for (const geometry of geometries) {
      if (typeof geometry?.dispose === 'function') geometry.dispose();
    }
  }

  _rebuildArena(stageId) {
    this.gadgetSystem?.reset();
    this.projectileManager?.dispose();
    this.paintSystem?.dispose();
    this.jumpPadSystem?.dispose();
    if (this.stageDecor?.group) {
      this.scene.remove(this.stageDecor.group);
      this._disposeObjectTree(this.stageDecor.group);
    }
    if (this.arena?.group) {
      this.scene.remove(this.arena.group);
      this._disposeObjectTree(this.arena.group);
      this.arena.dispose();
    }

    this.arena = new Arena(stageId);
    this.scene.add(this.arena.group);
    this.paintSystem = new PaintSystem(this.arena.halfWidth, this.arena.halfDepth);
    for (const mesh of this.arena.paintableFloorMeshes) this.paintSystem.applyToMaterial(mesh.material);
    this.stageDecor = new StageDecor(this.scene, this.arena, { lowQuality: this._isLowQuality() });
    this.jumpPadSystem = new JumpPadSystem(this.scene, this.arena.stage.jumpPads);
    this.cameraController.arena = this.arena;
    this.cameraController.collisionMeshes = this.arena.group.children;

    this.projectileManager = new ProjectileManager(
      this.scene, this.arena, this.paintSystem, this.particleManager, this.audioManager,
    );
    this.projectileManager.onCharacterHit = (targetTeam, damage, hitPoint, metadata) => (
      this._onCharacterHit(targetTeam, damage, hitPoint, metadata)
    );
    this.projectileManager.onPaint = (team, paintedCells) => {
      if (team === TEAM.PLAYER) this.player.special.addCharge(paintedCells);
      else if (team === TEAM.CPU) {
        this.cpu.special.addCharge(paintedCells * AI.specialChargeMultiplier * this.cpu.difficulty.specialChargeMult);
      }
    };
    this.gadgetSystem = new GadgetSystem(
      this.scene, this.arena, this.paintSystem, this.particleManager, this.audioManager,
      (targetTeam, damage, hitPoint, metadata) => this._onCharacterHit(targetTeam, damage, hitPoint, metadata),
    );
    this.gadgetSystem.attachProjectileManager(this.projectileManager);
    this.projectileManager.gadgetSystem = this.gadgetSystem;
    this.player.spawnPoint.copy(this.arena.spawnPoints.player);
    this.cpu.spawnPoint.copy(this.arena.spawnPoints.cpu);
    this.player.position.copy(this.player.spawnPoint);
    this.cpu.position.copy(this.cpu.spawnPoint);
    this._faceSpawnPoints();
  }

  _applyRewardTheme() {
    const equipped = this.progression.equipped;
    document.body.dataset.rewardGold = String(equipped.theme === 'goldChampion');
    document.body.dataset.rewardCombo = String(equipped.effect === 'comboGlow');
    document.body.dataset.rewardTrail = String(equipped.trail === 'aquaTrail');
    document.body.dataset.rewardTitle = String(equipped.title === 'skyAce');
    document.body.dataset.rewardNeon = String(equipped.theme === 'neonCyan');
    document.body.dataset.rewardStreetTitle = String(equipped.title === 'streetLegend');
    document.body.dataset.rewardRankPulse = String(equipped.effect === 'rankPulse');
  }

  _selectCharacter(characterId) {
    const nextPlayer = new Player(
      this.arena.spawnPoints.player,
      this.cameraController,
      this.input,
      characterId,
    );
    const resolvedId = nextPlayer.characterId;
    this.ui.setCharacter(resolvedId, nextPlayer.characterName, nextPlayer.characterTagline);
    this.characterPreview?.setCharacter(resolvedId);
    this.selectedCharacterId = resolvedId;

    if (this.player.characterId === resolvedId) {
      nextPlayer.dispose();
      return;
    }

    this.scene.remove(this.player.mesh);
    this.player.dispose();
    this.player = nextPlayer;
    this.scene.add(this.player.mesh);
    this.touchControls?.setWeaponType(this.player.weapon.type);
    this._faceSpawnPoints();
  }

  _selectDifficulty(difficultyId) {
    const preset = AI_DIFFICULTY[difficultyId] ?? AI_DIFFICULTY.standard;
    this.selectedDifficulty = preset.id;
    this.cpu.setDifficulty(preset);
    this.ui.setDifficulty(preset.id, preset.labelJa ?? preset.label);
    this.settings.setDifficultyId(preset.id);
  }

  _openSettings() {
    if (this.state !== STATE.TITLE) return;
    this.settingsOpen = true;
    this.ui.setSettingsValues(this.settings.values);
    this.ui.updateKeybindLabels(this.settings.values.keyBindings);
    this.ui.hideTitle();
    this.ui.showSettings();
  }

  _closeSettings() {
    // Abandon an in-progress "press a key..." capture so it can't swallow
    // the next real gameplay keypress after leaving the settings screen.
    this.input.cancelKeyListen();
    if (this._activeKeybindButton) {
      this.ui.setKeybindListening(this._activeKeybindButton, false);
      this.ui.updateKeybindLabels(this.settings.values.keyBindings);
      this._activeKeybindButton = null;
    }
    this.settingsOpen = false;
    this.ui.hideSettings();
    this.ui.showTitle();
  }

  /** Starts a "press a key to rebind" capture for the given action/button, safely abandoning any prior capture. */
  _startKeyRebind(action, button) {
    if (this._activeKeybindButton && this._activeKeybindButton !== button) {
      this.ui.setKeybindListening(this._activeKeybindButton, false);
      this.ui.updateKeybindLabels(this.settings.values.keyBindings);
    }
    this._activeKeybindButton = button;
    this.ui.setKeybindListening(button, true);
    this.input.listenForNextKey((code) => {
      this._activeKeybindButton = null;
      if (code !== 'Escape') this.settings.setKeyBinding(action, code);
      this.ui.updateKeybindLabels(this.settings.values.keyBindings);
    });
  }

  /** Debug: advance the enemy's appearance type and re-show its intro banner. */
  _cycleEnemyAppearance() {
    this.cpu.cycleEnemyAppearance();
    this.cpu.consumeIntroBanner(); // shown directly below; avoid a duplicate next frame
    this.ui.showEnemyIntro(
      this.cpu.appearanceNameJa ?? this.cpu.appearanceName,
      this.cpu.appearanceTypeJa,
      this.cpu.appearance.main,
    );
  }

  _bindWindow() {
    const resize = () => this._resizeViewport();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.visualViewport?.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => this._onVisibilityChange());
  }

  /** Backgrounding a tab freezes the main loop (see the document.hidden check in _animate),
   *  but HTMLAudioElement/AudioContext playback keeps going unless told otherwise. */
  _onVisibilityChange() {
    if (document.hidden) {
      this.audioManager.pauseBattleBGM();
      this.audioManager.suspendContext();
    } else if (this.state === STATE.PLAYING) {
      this.audioManager.resumeContext();
      this.audioManager.resumeBattleBGM();
    }
    // If paused/title/etc., leave audio as-is; the pause/resume flow owns it from here.
  }

  _resizeViewport() {
    const width = window.visualViewport?.width || window.innerWidth;
    const height = window.visualViewport?.height || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  _setupCpuVisibilityAid() {
    const ringGeo = new THREE.TorusGeometry(0.62, 0.025, 6, 28);
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.cpu, transparent: true, opacity: 0.46, depthWrite: false });
    this.cpuRing = new THREE.Mesh(ringGeo, ringMat);
    this.cpuRing.rotation.x = Math.PI / 2;
    this.cpuRing.position.y = 0.035;
    this.cpu.mesh.add(this.cpuRing);
  }

  // -------------------------------------------------------------- flow
  _startMatch() {
    this.paintSystem.reset();
    for (const panel of this.arena.wallPanels) panel.paint.reset();
    this.projectileManager.reset();
    this.gadgetSystem.reset();
    this.particleManager.reset();
    this.jumpPadSystem.reset();
    this._paintSpawnSafeZone(this.arena.spawnPoints.player, TEAM.PLAYER);
    this._paintSpawnSafeZone(this.arena.spawnPoints.cpu, TEAM.CPU);

    this.player.position.copy(this.arena.spawnPoints.player);
    this.player.velocity.set(0, 0, 0);
    this.player.hp = 100;
    this.player.ink = 100;
    this.player.alive = true;
    this.player.inkSurfActive = false;
    this.player.inkSurfCooldown = 0;
    this.player.isClimbing = false;
    this.player._climbPanel = null;
    this.player.resetInkRoll({ newMatch: true });
    this.player.resetJumpPadBoost();
    this.player.invincibleTimer = 0;
    this.player._healthRegenTimer = 0;
    this.player.koScored = 0;
    this.player.deaths = 0;
    this.player.specialsUsed = 0;
    this.player.subWeaponsUsed = 0;
    this.player.shotsFired = 0;
    this.player.climbsCompleted = 0;
    this.player.skySplashHits = 0;
    this.player.resetHitCombo({ newMatch: true });
    this.player.special.reset();
    this.player.weapon.cooldown = 0;
    this.player.weapon.resetCharge();
    this.player._fireWasHeld = false;
    this.player.subWeapon.cooldown = 0;
    this.player.subWeapon.setType(this.selectedSubWeaponId);
    this.touchControls?.setSubWeaponType(this.selectedSubWeaponId);
    this.player.special.setType(this.selectedSpecialId);
    this.touchControls?.setSpecialType(this.selectedSpecialId);
    this.player.gearPower = GEAR_POWERS[this.progression.equipped.gear] ?? null;

    this.cpu.position.copy(this.arena.spawnPoints.cpu);
    this.cpu.velocity.set(0, 0, 0);
    this.cpu.hp = 100;
    this.cpu.ink = 100;
    this.cpu.alive = true;
    this.cpu.inkSurfActive = false;
    this.cpu.inkSurfCooldown = 0;
    this.cpu.invincibleTimer = 0;
    this.cpu._healthRegenTimer = 0;
    this.cpu.koScored = 0;
    this.cpu.deaths = 0;
    this.cpu.skySplashHits = 0;
    this.cpu.resetHitCombo({ newMatch: true });
    this.cpu.practiceMode = this.practiceMode;
    this.cpu.resetJumpPadBoost();
    this.cpu.resetTactics({ newMatch: true });
    // Fresh random look each match; the entrance animation plays once the
    // countdown ends (see _updateCountdown), not during the reset.
    if (this.cupActive) {
      const rival = this.cupController.currentRival;
      this.cpu.applyAppearance(rival.appearanceType, { playIntro: false });
      this.cpu.setRivalTactics(rival.tactics);
    }
    else this.cpu.randomizeAppearance({ playIntro: false });

    this._faceSpawnPoints();
    this._tutorialStartPosition.copy(this.player.position);

    this.matchTimeRemaining = MATCH.durationSec;
    this.countdownRemaining = MATCH.countdownSec + MATCH.startFlashSec;
    this.judgingRemaining = 0;
    this._lastFinalSecond = null;
    this.inSuddenDeath = false;
    this._suddenDeathForcedWinnerTeam = null;
    this.ruleController.reset();

    this.ui.hideTitle();
    this.ui.hideResultScreen();
    this.ui.hidePause();
    this.ui.hideCountdown();
    this.ui.hideRivalCard();
    this.ui.hideTutorial();
    this.ui.clearStatusMessage();
    this.ui.showHUD();
    this.ui.hideRespawnBanner();
    this.ui.updateEnemyMarker({ visible: false });
    this.ui.updateEnemySpecialWarning({ visible: false });
    this.ui.resetFinale();
    this.ui.setSuddenDeathActive(false);
    this.ui.setObjectiveStatus(MATCH_RULES[this.selectedRuleId].labelJa ?? MATCH_RULES[this.selectedRuleId].label);
    this.ui.setCupSummary({ visible: false });
    this.ui.resetInkRollFeedback();
    this.ui.hideDamageDirection();
    this.ui.resetTurfMap();
    this._cpuHitFlashTimer = 0;
    this._wasPlayerInkSurfing = false;
    this._currentCameraSink = 0;
    this.audioManager.stopInkSurfLoop();
    this.audioManager.stopBattleBGM();
    this.audioManager.setBattleFinale(false);
    this.touchControls?.show();

    this._lastCountdownDigit = null;
    if (this.cupActive) {
      this._rivalIntroRemaining = 3.4;
      this.ui.showRivalCard({
        rival: this.cupController.currentRival,
        round: this.cupRound,
        final: this.cupController.isFinalRound,
      });
      this.state = STATE.RIVAL_INTRO;
    } else {
      this.ui.showCountdown();
      this.state = STATE.COUNTDOWN;
    }

    this.audioManager.resume();
    this.input.requestPointerLock();
  }

  /** Freezes the match and shows the pause/controls overlay. Safe to call repeatedly. */
  _pauseMatch() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.audioManager.pauseBattleBGM();
    this.audioManager.suspendContext();
    // Releases any touch buttons still held (e.g. fire/joystick) and hides
    // the on-screen controls, which would otherwise sit interactable but
    // invisible underneath the pause overlay.
    this.touchControls?.hide();
    this.ui.showPause();
  }

  /** Escape (or losing focus) drops pointer lock mid-match; freeze the game instead of leaving the player blind. */
  _pauseFromLockLoss() {
    this._pauseMatch();
  }

  _resumeFromPause() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.ui.hidePause();
    this.audioManager.resumeContext();
    this.audioManager.resumeBattleBGM();
    this.touchControls?.show();
    this.input.requestPointerLock();
  }

  /** Bails out of an in-progress match back to the title screen without counting a result. */
  _quitToTitle() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.TITLE;
    this.ui.hidePause();
    this.ui.hideHUD();
    this.ui.hideRespawnBanner();
    this.ui.hideDamageDirection();
    this.ui.updateEnemyMarker({ visible: false });
    this.ui.updateEnemySpecialWarning({ visible: false });
    this.audioManager.resumeContext();
    this.audioManager.stopBattleBGM();
    this.audioManager.stopInkSurfLoop();
    this.touchControls?.hide();
    if (this.tutorialActive) {
      this.tutorialController.stop();
      this.tutorialActive = false;
      this.practiceMode = this._tutorialPreviousPractice;
      this.ui.setPracticeMode(this.practiceMode);
      this.ui.hideTutorial();
    }
    if (this.cupActive) this.cupSessionActive = false;
    this._updateCupProgressUI();
    this.ui.showTitle();
  }

  _beginJudging() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.JUDGING;
    this.judgingRemaining = MATCH.judgingDelaySec;
    this.paintSystem.flush();
    this.input.exitPointerLock();
    this.touchControls?.hide();
    this.audioManager.stopInkSurfLoop();
    this.audioManager.stopBattleBGM();
    this.audioManager.playTimeUp();
    this.ui.updateEnemySpecialWarning({ visible: false });
    this.ui.resetInkRollFeedback();
    this.ui.hideDamageDirection();
    this.ui.showTimeUp(this.inSuddenDeath ? '決着！' : 'タイムアップ！');
  }

  /**
   * Called whenever matchTimeRemaining reaches zero — either regulation time
   * or, once already in overtime, the sudden-death clock itself. Regulation
   * only extends into overtime once, so this can't loop forever.
   */
  _handleTimeExpired(cov) {
    if (this._suddenDeathForcedWinnerTeam) {
      this._beginJudging();
      return;
    }
    if (this.selectedRuleId === 'turf'
      && !this.inSuddenDeath
      && isSuddenDeathTie(cov.playerPct, cov.cpuPct, MATCH.suddenDeathMarginPct)) {
      this._enterSuddenDeath();
      return;
    }
    this._beginJudging();
  }

  _enterSuddenDeath() {
    this.inSuddenDeath = true;
    this.matchTimeRemaining = MATCH.suddenDeathDurationSec;
    // Let the final-countdown beeps/UI fire again during overtime's own
    // closing seconds instead of staying suppressed from regulation.
    this._lastFinalSecond = null;
    this.ui.setSuddenDeathActive(true);
    this.ui.showStatusMessage('サドンデス！ 先に突き放した方が勝利', 2.8);
  }

  _endMatch() {
    this.state = STATE.RESULT;
    this.ui.hideTimeUp();

    const cov = this.paintSystem.getCoverage();
    // A KO scored during sudden death ends the match outright in the
    // scorer's favor (see _onCharacterHit), overriding the usual
    // coverage-based outcome check — the instant of a KO doesn't necessarily
    // line up with whoever currently has more floor painted.
    const outcome = this.ruleController.resolveOutcome({
      coverage: cov,
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
      forcedWinnerTeam: this._suddenDeathForcedWinnerTeam,
    });

    if (this.cupActive) this.cupController.recordResult(outcome);
    const cupChampion = this.cupActive && this.cupController.champion;
    const earned = this.progression.evaluate({
      playerPct: cov.playerPct,
      skySplashes: this.player.skySplashHits,
      bestCombo: this.player.bestHitCombo,
      cupChampion,
      outcome,
      deaths: this.player.deaths,
      climbs: this.player.climbsCompleted,
      practiceMode: this.practiceMode,
    });
    this.ui.setChallengeBoard(CHALLENGES, this.progression.unlocked);
    this.ui.setDailyChallengeBoard(this.dailyChallenges.todaysChallenges, this.dailyChallenges.completed);
    this.ui.setRewardLoadout(this.progression.availableRewards, this.progression.equipped);
    this._applyRewardTheme();

    if (outcome === 'win') this.audioManager.playWin();
    else if (outcome === 'lose') this.audioManager.playLose();

    // Practice matches are a safe sandbox, not a real result — don't let them
    // skew the persisted win/loss record.
    if (!this.practiceMode) {
      this.matchRecord.recordMatch({
        outcome,
        difficultyId: this.selectedDifficulty,
        playerPct: cov.playerPct,
        koPlayer: this.player.koScored,
        koCpu: this.cpu.koScored,
      });
      this.ui.updateMatchRecord(this.matchRecord);
    }

    const stats = {
      inkRolls: { player: this.player.inkRollsUsed, cpu: 0 }, // CPU never ink-rolls
      climbs: { player: this.player.climbsCompleted, cpu: this.cpu.climbsCompleted },
      subWeapons: { player: this.player.subWeaponsUsed, cpu: this.cpu.subWeaponsUsed },
      specials: { player: this.player.specialsUsed, cpu: this.cpu.specialsUsed },
      skySplashes: { player: this.player.skySplashHits, cpu: this.cpu.skySplashHits },
      bestCombos: { player: this.player.bestHitCombo, cpu: this.cpu.bestHitCombo },
    };
    const rank = calculateBattleRank({
      playerPct: cov.playerPct,
      cpuPct: cov.cpuPct,
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
      outcome,
      difficultyId: this.selectedDifficulty,
      practiceMode: this.practiceMode,
      stats,
    });
    let profileResult = this.playerProfile.recordMatch({
      outcome,
      difficultyId: this.selectedDifficulty,
      practiceMode: this.practiceMode,
      playerPct: cov.playerPct,
      koPlayer: this.player.koScored,
      zoneHoldSec: this.ruleController.zone.player,
      bestCombo: this.player.bestHitCombo,
      battleScore: rank.score,
    });

    // Daily challenges only grant bonus XP (never a reward), and — like the
    // XP formula above — don't run in practice mode so it can't be farmed.
    let dailyEarned = [];
    if (!this.practiceMode) {
      const dailyResult = this.dailyChallenges.evaluate({
        outcome,
        playerPct: cov.playerPct,
        bestCombo: this.player.bestHitCombo,
        koPlayer: this.player.koScored,
        subWeaponsUsed: this.player.subWeaponsUsed,
        specialsUsed: this.player.specialsUsed,
        climbs: this.player.climbsCompleted,
        deaths: this.player.deaths,
      });
      dailyEarned = dailyResult.earned;
      if (dailyResult.totalXp > 0) {
        const bonus = this.playerProfile.addXp(dailyResult.totalXp);
        profileResult = {
          ...profileResult,
          xpGained: profileResult.xpGained + dailyResult.totalXp,
          levelAfter: bonus.levelAfter,
          leveledUp: profileResult.leveledUp || bonus.leveledUp,
          rankName: bonus.rankName,
          rewardIds: [...new Set([...profileResult.rewardIds, ...bonus.rewardIds])],
          progress: bonus.progress,
        };
      }
      this.ui.setDailyChallengeBoard(this.dailyChallenges.todaysChallenges, this.dailyChallenges.completed);
    }
    const rankRewards = this.progression.unlockRewards(profileResult.rewardIds);
    this.ui.setRewardLoadout(this.progression.availableRewards, this.progression.equipped);
    this.ui.setPlayerProfile(profileResult.progress);
    this._applyRewardTheme();

    this.ui.showResult({
      playerPct: cov.playerPct,
      cpuPct: cov.cpuPct,
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
      outcome,
      stats,
      rank,
      suddenDeath: this.inSuddenDeath,
    });
    const mvp = this.selectedRuleId === 'zone' && this.ruleController.zone.player >= 9
      ? 'zone'
      : this.player.koScored >= 3
        ? 'ko'
        : cov.playerPct >= 55
          ? 'turf'
          : this.player.bestHitCombo >= 5
            ? 'combo'
            : 'allRound';
    this.ui.setResultPerformance({
      weaponName: this.player.weapon.displayName,
      subWeaponName: this.player.subWeapon.profile.label,
      specialName: this.player.special.displayName,
      mvp,
      bestLabels: profileResult.newBests,
    });
    this.ui.setResultXp({
      visible: !this.practiceMode,
      xpGained: profileResult.xpGained,
      level: profileResult.progress.level,
      rankName: profileResult.progress.rankName,
      current: profileResult.progress.current,
      required: profileResult.progress.required,
      leveledUp: profileResult.leveledUp,
    });
    const rival = this.cupActive ? this.cupController.currentRival : null;
    this.ui.setResultRivalDialogue(
      rival
        ? (outcome === 'win'
            ? (rival.winLineJa ?? rival.winLine)
            : outcome === 'lose'
              ? (rival.loseLineJa ?? rival.loseLine)
              : '引き分けでは、答えが少し先送りになるだけだ。')
        : '',
    );
    const objective = this.ruleController.getResultSummary({
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
      stageLabel: STAGES[this.selectedStageId].labelJa ?? STAGES[this.selectedStageId].label,
    });
    const cup = this.cupActive
      ? `ライバルカップ ${this.cupRound}/3 · ${this.cupController.currentRival.nameJa ?? this.cupController.currentRival.name} · ${this.cupWins}勝${this.cupController.isFinalRound ? (cupChampion ? ' · 王者' : ' · カップ完走') : ''}`
      : '';
    this.ui.setResultMeta({
      ruleLabel: MATCH_RULES[this.selectedRuleId].labelJa ?? MATCH_RULES[this.selectedRuleId].label,
      objective,
      cup,
      rewards: [
        ...earned.map((challenge) => challenge.rewardJa ?? challenge.reward),
        ...rankRewards.map((reward) => reward.labelJa ?? reward.label),
        ...dailyEarned.map((challenge) => `${challenge.labelJa} +${challenge.xp}XP`),
      ],
    });
    this.ui.setCupSummary({
      visible: this.cupActive && this.cupController.isFinalRound,
      results: this.cupController.results,
      wins: this.cupWins,
      champion: cupChampion,
    });
    this._updateCupProgressUI();
    this.ui.setRestartLabel(
      this.cupActive
        ? (!this.cupController.isFinalRound ? `次のライバル (${this.cupRound + 1}/3)` : 'タイトルに戻る')
        : 'もう一度戦う (R)',
    );
  }

  /** Pre-inks a safe home patch around a spawn point so nobody wakes up standing on neutral/enemy ground. */
  _paintSpawnSafeZone(point, team) {
    this.paintSystem.paintSplat(point.x, point.z, ARENA.spawnSafeRadius, team);
  }

  _onCharacterHit(targetTeam, damage, hitPoint, metadata = null) {
    const target = targetTeam === TEAM.PLAYER ? this.player : this.cpu;
    const shooter = targetTeam === TEAM.PLAYER ? this.cpu : this.player;

    // Same guard Character.takeDamage uses internally: a shot that lands on a
    // dead or invincible target does no damage, so it shouldn't play a damage
    // sound or flash the hit UI either.
    if (!target.alive || target.invincibleTimer > 0) return;

    const skySplash = Boolean(metadata?.skySplash && metadata.attackerTeam === shooter.team);
    const died = target.takeDamage(damage);
    const hitCombo = shooter.registerHitCombo();
    if (shooter.team === TEAM.PLAYER) this.ui.showHitCombo(hitCombo, { skySplash });
    if (skySplash) {
      shooter.skySplashHits++;
      if (shooter.team === TEAM.PLAYER) this.ui.showSkySplash(shooter.skySplashHits);
    }
    this.audioManager.playDamage();
    this.ui.flashCrosshair(
      targetTeam === TEAM.CPU,
      skySplash && shooter.team === TEAM.PLAYER,
    );
    if (targetTeam === TEAM.PLAYER) {
      this.ui.flashHit();
      this.cameraController.getFlatForward(_damageCameraForward);
      this.cameraController.getFlatRight(_damageCameraRight);
      this.ui.showDamageDirection(
        calculateRelativeDirectionAngle(
          this.player.position,
          shooter.position,
          _damageCameraForward,
          _damageCameraRight,
        ),
        died,
      );
      void this.input.pulseGamepad({
        duration: died ? 360 : 145,
        weakMagnitude: died ? 0.85 : 0.42,
        strongMagnitude: died ? 1 : 0.72,
        force: true,
      });
    }
    if (targetTeam === TEAM.CPU) this._flashCpuBody();

    if (died) {
      shooter.koScored++;
      // In sudden death, a KO decides the match outright — aggression is
      // rewarded over waiting out the overtime clock. Recorded now so
      // _endMatch can use it instead of the coverage comparison below, which
      // may not reflect who currently has the edge.
      if (this.inSuddenDeath) this._suddenDeathForcedWinnerTeam = shooter.team;
      const color = targetTeam === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
      // A splat swings nearby turf as well as the duel, binding combat back
      // into the mode's territory-control objective.
      const paintedCells = this.paintSystem.paintSplat(
        target.position.x,
        target.position.z,
        PAINT.koSplatRadius,
        shooter.team,
        { splatterScale: 1.3, glossScale: 1.2 }
      );
      const chargeMult = shooter.team === TEAM.CPU
        ? AI.specialChargeMultiplier * this.cpu.difficulty.specialChargeMult
        : 1;
      shooter.special?.addCharge(paintedCells * chargeMult);
      this.particleManager.spawnKOExplosion(hitPoint, color);
      this.audioManager.playKO();
      this.ui.showStatusMessage(targetTeam === TEAM.PLAYER ? 'やられた！' : 'CPUを撃破！', 1.8);
      if (targetTeam === TEAM.PLAYER) {
        this.ui.resetHitCombo();
        this.ui.showRespawnBanner();
      }
      else {
        void this.input.pulseGamepad({
          duration: 170,
          weakMagnitude: 0.62,
          strongMagnitude: 0.34,
          force: true,
        });
      }
      if (this.inSuddenDeath) this._beginJudging();
    }
  }

  // ------------------------------------------------------------ main loop
  _animate(timestamp) {
    requestAnimationFrame(this._animate);
    this.timer.update(timestamp);
    const rawDt = this.timer.getDelta();
    if (document.hidden) return;

    const dt = Math.min(rawDt, PERF.maxDeltaSec);
    this.elapsedTime += dt;

    this._updateFps(dt);
    this._update(dt);
    // Background/landmark/prop animation runs every frame regardless of
    // match state (title/countdown/playing/result) so the stage reads as
    // alive immediately, not just once a match starts.
    this.stageDecor.updateStageAnimations(dt, this.elapsedTime);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    this.input.updateGamepad(dt);

    if (this.input.wasJustPressed('Backquote')) {
      this.debugMode = !this.debugMode;
      this.ui.setDebugVisible(this.debugMode);
    }

    // Debug: 'V' cycles the enemy appearance (Speed -> Street -> Heavy -> Technical).
    if (this.input.wasJustPressed('KeyV')) this._cycleEnemyAppearance();
    if (this.debugMode && this.input.wasJustPressed('KeyP')) {
      this.player.special.charge = 100;
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyL')) {
      this.cpu.debugStartClimbPlan(this.arena);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyB')) {
      this.cpu.debugThrowBombAt(this.player);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyK')) {
      this.cpu.debugCycleWeapon();
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyO')) {
      this.cpu.debugStartSpecial(this.player, this.ui);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyT')) {
      this.matchTimeRemaining = Math.min(this.matchTimeRemaining, 12);
      this._lastFinalSecond = null;
      this.ui.hideFinalCountdown();
      this.audioManager.setBattleFinale(false);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyG')) {
      this.player.debugStartInkRoll(this.particleManager, this.audioManager, this.ui);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyC')) {
      this.player.debugFireChargedShot(
        this.projectileManager,
        this.particleManager,
        this.audioManager,
        this.ui,
      );
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyH')) {
      this.player.debugStorePrecisionCharge(this.audioManager, this.ui);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyJ')) {
      this.player.position.set(0, 0, this.arena.halfDepth - 0.75);
      this.player.velocity.set(0, 0, 0);
      this.player.grounded = true;
      this.cameraController.yaw = 0;
      this.cameraController.pitch = -0.05;
      this.ui.showStatusMessage('CAMERA COLLISION TEST', 0.8);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyN')) {
      this.player.position.set(0, 0, this.arena.halfDepth - 2.2);
      this.player.velocity.set(0, 0, 0);
      this.player.grounded = true;
      this.cameraController.yaw = Math.PI;
      this.cameraController.pitch = 0;
      this.ui.showStatusMessage('BOUNDARY WALL PAINT TEST', 0.8);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyM')) {
      this.player.position.set(-9, 0, 3.8);
      this.player.velocity.set(0, 0, 0);
      this.player.grounded = true;
      this.cameraController.yaw = Math.PI;
      this.cameraController.pitch = 0;
      this.ui.showStatusMessage('OBSTACLE WALL PAINT TEST', 0.8);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyI')) {
      const panel = this.arena.climbPanels.find(
        (candidate) => candidate.label === 'CYLINDER 3 FACE 6',
      );
      if (panel) {
        const center = panel.paint.origin.clone()
          .addScaledVector(panel.paint.tangent, panel.paint.width * 0.5);
        this.player.position.copy(center)
          .addScaledVector(panel.normal, -(MOVEMENT.capsuleRadius + 0.58));
        this.player.position.y = panel.baseY;
        this.cameraController.yaw = Math.atan2(-panel.normal.x, -panel.normal.z);
        this.cameraController.getFlatRight(_enemyScreenPos);
        this.player.position.addScaledVector(_enemyScreenPos, -CAMERA.muzzleShoulderOffset);
      } else {
        this.player.position.set(-6.5, 0, -12.45);
        this.cameraController.yaw = Math.PI;
      }
      this.player.velocity.set(0, 0, 0);
      this.player.grounded = true;
      this.cameraController.pitch = 0;
      this.ui.showStatusMessage('CYLINDER WALL PAINT TEST', 0.8);
    }
    if (this.debugMode && this.state === STATE.PLAYING && this.input.wasJustPressed('KeyR')) {
      const panel = this.player._findClimbablePanel(this.arena);
      if (panel) {
        this.player._debugClimbHold = true;
        this.player._startClimb(panel);
        this.ui.showStatusMessage(`CLIMB TEST: ${panel.label}`, 0.8);
      } else {
        this.ui.showStatusMessage('CLIMB TEST: NO INK PATH', 0.8);
      }
    }

    switch (this.state) {
      case STATE.TITLE:
        // Consume the edge even while settings are open so it cannot start a
        // match later, immediately after the settings overlay is closed.
        if (!this.settingsOpen && this._consumeConfirmPress()) {
          this._beginSelectedMode();
          break;
        }
        if (this.settingsOpen) this._consumeConfirmPress();
        this._updateIdleCamera(dt);
        break;
      case STATE.RIVAL_INTRO:
        this._updateRivalIntro(dt);
        break;
      case STATE.COUNTDOWN:
        this._updateCountdown(dt);
        break;
      case STATE.PLAYING:
        this._updatePlaying(dt);
        break;
      case STATE.PAUSED:
        // Frozen: no timers/physics/AI advance until resumed or quit.
        if (this.input.wasJustPressed('Escape') || this._consumeConfirmPress()) {
          this._resumeFromPause();
        }
        break;
      case STATE.JUDGING:
        this._updateJudging(dt);
        break;
      case STATE.RESULT:
        this._updateResult(dt);
        break;
    }

    if (this.debugMode) this._updateDebugOverlay();
  }

  _updateIdleCamera(dt) {
    const [dx, dy] = this.input.consumeMouseDelta();
    if (this.input.pointerLocked || this.input.isTouch || this.input.gamepadConnected) {
      this.cameraController.applyLook(dx, dy);
    }
    this.cameraController.update(dt, this.player.position);
    this.player.syncMesh(this.elapsedTime);
    this.cpu.syncMesh(this.elapsedTime);
    this.characterPreview?.update(this.elapsedTime);
  }

  _consumeConfirmPress() {
    // Read both edges before combining them. Standard pads map their bottom
    // face button to both jump (Space) and menu confirm, so short-circuiting
    // here would leave one edge armed for a later screen.
    const keyboardOrJumpButton = this.input.wasJustPressed('Space');
    const gamepadConfirm = this.input.wasJustPressed('GamepadConfirm');
    // On Nintendo pads the same physical A button is also the in-match bomb
    // action. Do not let the title/pause/result press leak into gameplay.
    if (gamepadConfirm && this.input.gamepadLayout === 'nintendo') {
      this.input.wasJustPressed('KeyE');
    }
    return keyboardOrJumpButton || gamepadConfirm;
  }

  _updateRivalIntro(dt) {
    this._rivalIntroRemaining = Math.max(0, this._rivalIntroRemaining - dt);
    this.cameraController.update(dt, this.player.position);
    this.player.syncMesh(this.elapsedTime);
    this.cpu.syncMesh(this.elapsedTime);
    if (this._rivalIntroRemaining > 0) return;
    this.ui.hideRivalCard();
    this.ui.showCountdown();
    this.state = STATE.COUNTDOWN;
  }

  _updateCountdown(dt) {
    this.countdownRemaining -= dt;
    const [dx, dy] = this.input.consumeMouseDelta();
    if (this.input.pointerLocked || this.input.isTouch || this.input.gamepadConnected) {
      this.cameraController.applyLook(dx, dy);
    }
    this.cameraController.update(dt, this.player.position);
    this.player.syncMesh(this.elapsedTime);
    this.cpu.syncMesh(this.elapsedTime);

    const remaining = Math.max(0, this.countdownRemaining);
    let label;
    if (remaining > MATCH.startFlashSec) {
      label = String(Math.ceil(remaining - MATCH.startFlashSec));
    } else {
      label = 'スタート';
    }
    if (label !== this._lastCountdownDigit) {
      this._lastCountdownDigit = label;
      this.ui.setCountdownText(label);
      if (label === 'スタート') this.audioManager.playStart();
      else this.audioManager.playCountdownBeep();
    }

    if (this.countdownRemaining <= 0) {
      this.ui.hideCountdown();
      this.cpu.playIntro(); // enemy "appears" as play begins
      this.state = STATE.PLAYING;
      this.audioManager.playBattleBGM();
      if (this.tutorialActive) {
        this.ui.showTutorialStep(this.tutorialController.step, this.tutorialController.progress);
      }
      if (this.practiceMode) this.ui.showStatusMessage('練習モード — CPUは攻撃しません', 2.5);
    }
  }

  _updatePlaying(dt) {
    // Redundant safety net alongside the pointer-lock-loss handler: some
    // embedded/automated environments never actually grant pointer lock, so
    // Esc wouldn't otherwise trigger anything there.
    if (this.input.wasJustPressed('Escape')) this._pauseMatch();

    let matchOver = false;
    if (this.tutorialActive) {
      this.matchTimeRemaining = MATCH.durationSec;
    } else {
      this.matchTimeRemaining -= dt;
      matchOver = this.matchTimeRemaining <= 0;
      this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining);
      this._updateFinalCountdown();
    }

    const [dx, dy] = this.input.consumeMouseDelta();
    if (this.input.pointerLocked || this.input.isTouch || this.input.gamepadConnected) {
      this.cameraController.applyLook(dx, dy);
    }

    const ctx = {
      arena: this.arena,
      paintSystem: this.paintSystem,
      projectileManager: this.projectileManager,
      particleManager: this.particleManager,
      audioManager: this.audioManager,
      player: this.player,
      cpu: this.cpu,
      ui: this.ui,
      onCharacterHit: (targetTeam, damage, hitPoint) => this._onCharacterHit(targetTeam, damage, hitPoint),
      controlsEnabled: true,
      elapsedTime: this.elapsedTime,
      ruleContext: this.ruleController.getAIContext({
        timeRemaining: this.matchTimeRemaining,
        koPlayer: this.player.koScored,
        koCpu: this.cpu.koScored,
      }),
    };

    const playerWasAlive = this.player.alive;
    const cpuWasAlive = this.cpu.alive;
    this.player.update(dt, ctx);
    this.touchControls?.setWeaponType(this.player.weapon.type);
    this.cpu.update(dt, ctx);
    this.jumpPadSystem.update(dt, [this.player, this.cpu], {
      particleManager: this.particleManager,
      audioManager: this.audioManager,
      ui: this.ui,
    });
    this._updateTutorialProgress();
    if (this.state !== STATE.PLAYING) return;
    this.ui.updateEnemySpecialWarning({
      visible: this.cpu.alive && (this.cpu.specialWindingUp || this.cpu.special.active),
      active: this.cpu.special.active,
      specialNameJa: this.cpu.special.profile.nameJa,
    });
    if (!playerWasAlive && this.player.alive) {
      this._paintSpawnSafeZone(this.arena.spawnPoints.player, TEAM.PLAYER);
      this.ui.hideDamageDirection();
    }
    if (!cpuWasAlive && this.cpu.alive) this._paintSpawnSafeZone(this.arena.spawnPoints.cpu, TEAM.CPU);

    // Show the archetype name banner when the enemy (re)appears.
    if (this.cpu.consumeIntroBanner()) {
      const rival = this.cupActive ? this.cupController.currentRival : null;
      this.ui.showEnemyIntro(
        rival?.nameJa ?? rival?.name ?? this.cpu.appearanceNameJa ?? this.cpu.appearanceName,
        this.cpu.appearanceTypeJa,
        this.cpu.appearance.main,
      );
    }

    this.projectileManager.update(dt, [this.player, this.cpu]);
    this.gadgetSystem.update(dt, [this.player, this.cpu]);
    this.particleManager.update(dt);
    this.paintSystem.update(dt);

    this._updateSurfFeedback(dt, this.player.inkSurfActive, this.player.isInkRolling);
    this.cameraController.update(dt, this.player.position, this._currentCameraSink);

    if (this.player.alive) this.ui.hideRespawnBanner();

    this.ui.tickStatusMessage(dt);
    this.ui.tickHitCombo(dt);
    this.ui.tickHitFlash(dt);
    this.ui.tickDamageDirection(dt);
    this._updateCpuVisibility(dt);

    const cov = this.paintSystem.getCoverage();
    const ruleWinner = this.tutorialActive ? null : this.ruleController.update(dt, {
      paintSystem: this.paintSystem,
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
    });
    this.ui.setObjectiveStatus(this.ruleController.getObjectiveText({
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
    }));
    if (ruleWinner) {
      this._suddenDeathForcedWinnerTeam = ruleWinner;
      matchOver = true;
    }
    // Once in overtime, breaking the tie by more than the margin ends the
    // match immediately rather than waiting out the sudden-death clock.
    if (this.inSuddenDeath && getSuddenDeathLeader(cov.playerPct, cov.cpuPct, MATCH.suddenDeathMarginPct)) {
      this._beginJudging();
    }
    this.ui.updateTurfMap(dt, {
      ownerGrid: this.paintSystem.ownerGrid,
      gridRes: this.paintSystem.gridRes,
      halfWidth: this.paintSystem.halfWidth,
      halfDepth: this.paintSystem.halfDepth,
      playerX: this.player.position.x,
      playerZ: this.player.position.z,
      playerYaw: this.player.yaw,
      playerAlive: this.player.alive,
      cpuX: this.cpu.position.x,
      cpuZ: this.cpu.position.z,
      cpuYaw: this.cpu.yaw,
      cpuVisible: this.cpu.alive && !this.cpu.isConcealed,
      playerPct: cov.playerPct,
      cpuPct: cov.cpuPct,
    });
    this.ui.updateHUD({
      timeRemaining: this.matchTimeRemaining,
      playerPct: cov.playerPct,
      cpuPct: cov.cpuPct,
      hp: this.player.hp,
      ink: this.player.ink,
      specialCharge: this.player.special.charge,
      specialReady: this.player.special.ready,
      specialActive: this.player.special.active,
      weaponName: this.player.weapon.displayName,
      weaponUsesCharge: this.player.weapon.usesCharge,
      weaponCharge: this.player.weapon.charge,
      weaponCharging: this.player.weapon.charging,
      weaponChargeReady: this.player.weapon.chargeReady,
      weaponChargeStored: this.player.weapon.chargeStored,
      weaponChargeStoreTimer: this.player.weapon.chargeStoreTimer,
      weaponChargeStoreDuration: this.player.weapon.chargeStoreDuration,
      subWeaponName: this.player.subWeapon.profile.label,
      subWeaponCooldown: this.player.subWeapon.cooldown,
      subWeaponCost: this.player.subWeapon.profile.cost,
      specialName: this.player.special.displayName,
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
      firing: this.input.fireHeld && this.player.alive && !this.player.inkSurfActive,
      submerged: this.player.inkSurfActive,
      rolling: this.player.isInkRolling,
      enemyFloor: this.player.onEnemyFloor,
    });

    if (matchOver) this._handleTimeExpired(cov);
  }

  _updateFinalCountdown() {
    const second = Math.ceil(this.matchTimeRemaining);
    if (second <= 0 || second > MATCH.finalCountdownSec) return;
    if (second === this._lastFinalSecond) return;

    this._lastFinalSecond = second;
    if (second === MATCH.finalCountdownSec) this.audioManager.setBattleFinale(true);
    this.audioManager.playFinalCountdown(second, MATCH.finalCountdownSec);
    this.ui.showFinalCountdown(second);
  }

  _updateJudging(dt) {
    this.judgingRemaining = Math.max(0, this.judgingRemaining - dt);
    this.particleManager.update(dt);
    this._updateSurfFeedback(dt, false);
    this.cameraController.update(dt, this.player.position);
    this.player.syncMesh(this.elapsedTime);
    this.cpu.syncMesh(this.elapsedTime);
    if (this.judgingRemaining <= 0) this._endMatch();
  }

  _updateResult(dt) {
    this.ui.updateEnemyMarker({ visible: false });
    this._updateSurfFeedback(dt, false);
    this.cameraController.update(dt, this.player.position);
    this.player.syncMesh(this.elapsedTime);
    this.cpu.syncMesh(this.elapsedTime);

    if (this.input.wasJustPressed('KeyR') || this._consumeConfirmPress()) this._continueFromResult();
  }

  _updateSurfFeedback(dt, active, rolling = false) {
    const targetFov = this._baseCameraFov
      + (rolling ? MOVEMENT.inkRollFovBoost : active ? MOVEMENT.inkSurfFovBoost : 0);
    const fovLerp = 1 - Math.exp(-MOVEMENT.inkSurfFovLerp * dt);
    const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, fovLerp);
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this._currentCameraSink = active ? MOVEMENT.inkSurfCameraSink : 0;

    if (active === this._wasPlayerInkSurfing) return;
    this._wasPlayerInkSurfing = active;
    if (active) this.audioManager.startInkSurfLoop();
    else this.audioManager.stopInkSurfLoop();
  }

  _flashCpuBody() {
    this._cpuHitFlashTimer = 0.16;
    for (const material of this.cpu.materials) {
      material.emissive?.setHex(0xff7a2f);
      if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0.6;
    }
  }

  _updateCpuVisibility(dt) {
    if (this._cpuHitFlashTimer > 0) {
      this._cpuHitFlashTimer -= dt;
      const intensity = Math.max(0, this._cpuHitFlashTimer / 0.16) * 0.6;
      for (const material of this.cpu.materials) {
        if (material.emissiveIntensity !== undefined) material.emissiveIntensity = intensity;
      }
    }

    this.cpuRing.visible = this.cpu.alive && !this.cpu.inkSurfActive;
    if (!this.cpu.alive) {
      this.ui.updateEnemyMarker({ visible: false });
      return;
    }

    if (this.cpu.isConcealed) {
      this.ui.updateEnemyMarker({ visible: false });
      return;
    }

    const distance = this.camera.position.distanceTo(this.cpu.position);
    if (distance > 26) {
      this.ui.updateEnemyMarker({ visible: false });
      return;
    }

    _enemyScreenPos.copy(this.cpu.position).add(_enemyMarkerOffset).project(this.camera);
    if (_enemyScreenPos.z < -1 || _enemyScreenPos.z > 1) {
      this.ui.updateEnemyMarker({ visible: false });
      return;
    }

    const width = this.renderer.domElement.clientWidth || window.innerWidth;
    const height = this.renderer.domElement.clientHeight || window.innerHeight;
    const x = (_enemyScreenPos.x * 0.5 + 0.5) * width;
    const y = (-_enemyScreenPos.y * 0.5 + 0.5) * height;
    const scale = THREE.MathUtils.clamp(1.08 - distance / 36, 0.62, 1);
    this.ui.updateEnemyMarker({ visible: true, x, y, hp: this.cpu.hp, scale });
  }

  _updateFps(dt) {
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this._fpsDisplay = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }

  _updateDebugOverlay() {
    const [pgx, pgz] = this.paintSystem.worldToGrid(this.player.position.x, this.player.position.z);
    const [cgx, cgz] = this.paintSystem.worldToGrid(this.cpu.position.x, this.cpu.position.z);
    const cov = this.paintSystem.getCoverage();
    const playerWallPaths = this.arena.climbPanels
      .filter((panel) => panel.paint.hasVerticalPath(TEAM.PLAYER, this.player.position))
      .map((panel) => panel.label);
    const playerPaintedWalls = this.arena.wallPanels
      .filter((panel) => panel.paint.playerCells > 0)
      .map((panel) => panel.label);
    const info = [
      `state: ${this.state}`,
      `player cell: (${pgx}, ${pgz})  grounded:${this.player.grounded}  climbing:${this.player.isClimbing}`,
      `cpu    cell: (${cgx}, ${cgz})  grounded:${this.cpu.grounded}  climbing:${this.cpu.isClimbing}`,
      `cpu ai state: ${this.cpu.state}  wall:${this.cpu._climbPlanPanel?.label ?? '-'}`,
      `cpu rule intent: ${this.cpu.ruleIntent}  rule:${this.selectedRuleId}`,
      `cpu climbs: ${this.cpu.climbsCompleted}/${this.cpu.climbAttempts}`,
      `cpu difficulty: ${this.cpu.difficulty.id}`,
      `map cpu visible: ${this.cpu.alive && !this.cpu.isConcealed}`,
      `cpu weapon: ${this.cpu.weapon.displayName}  switches:${this.cpu.weaponSwitches}`,
      `cpu sub weapons: ${this.cpu.subWeaponsUsed}  cd:${this.cpu.subWeapon.cooldown.toFixed(2)}  think:${this.cpu._bombDecisionCooldown.toFixed(2)}`,
      `cpu special: ${this.cpu.special.type}  ${this.cpu.special.charge.toFixed(1)}%  windup:${this.cpu.specialWindingUp}  active:${this.cpu.special.active}  used:${this.cpu.specialsUsed}`,
      `cpu hp/ink: ${this.cpu.hp.toFixed(0)}/${this.cpu.ink.toFixed(0)}`,
      `cpu target: ${this.cpu.debugTarget ? this.cpu.debugTarget.toArray().map((n) => n.toFixed(1)).join(',') : '-'}`,
      `player inv: ${this.player.invincibleTimer.toFixed(2)}  cpu inv: ${this.cpu.invincibleTimer.toFixed(2)}`,
      `coverage P:${cov.playerPct.toFixed(1)}% C:${cov.cpuPct.toFixed(1)}% N:${(100 - cov.playerPct - cov.cpuPct).toFixed(1)}%`,
      `special: ${this.player.special.charge.toFixed(1)}%  active:${this.player.special.active}`,
      `ink roll: ${this.player.isInkRolling}  armor:${this.player.inkRollArmorTimer.toFixed(2)}  cd:${this.player.inkRollCooldown.toFixed(2)}  used:${this.player.inkRollsUsed}`,
      `weapon: ${this.player.weapon.displayName}  charge:${(this.player.weapon.charge * 100).toFixed(0)}%  charging:${this.player.weapon.charging}  stored:${this.player.weapon.chargeStored}(${this.player.weapon.chargeStoreTimer.toFixed(2)})  bomb cd:${this.player.subWeapon.cooldown.toFixed(2)}`,
      `camera: shoulder dist:${this.cameraController.currentDistance.toFixed(2)}  blocked:${this.cameraController.cameraBlocked}`,
      `precision lines: ${this.projectileManager.chargeLinesFired}  cells:${this.projectileManager.chargeLinePaintedCells}  walls:${this.projectileManager.chargeWallStrokes}`,
      `wall panels: ${this.arena.wallPanels.length}  climbable:${this.arena.climbPanels.length}  player-painted:${this.arena.wallPanels.filter((p) => p.paint.playerCells > 0).length}`,
      `player painted walls: ${playerPaintedWalls.join(', ') || '-'}`,
      `player wall paths: ${playerWallPaths.join(', ') || '-'}`,
      'debug keys: N=boundary paint  M=box paint  I=cylinder paint  R=climb path  J=camera wall  C=full charge  H=keep charge  G=ink roll  T=final 12s  P=player special  O=CPU special  L=CPU climb  B=CPU bomb  K=CPU weapon  V=enemy',
      `projectiles active: ${this.projectileManager.pool.filter((p) => p.active).length}/${this.projectileManager.pool.length}`,
      `particles active: ${this.particleManager.pool.filter((p) => p.active).length}/${this.particleManager.pool.length}`,
    ].join('\n');
    this.ui.updateDebug(this._fpsDisplay, info);
  }
}
