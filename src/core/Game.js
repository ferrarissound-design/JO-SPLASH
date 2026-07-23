import * as THREE from 'three';
import { MATCH, TEAM, COLORS, PERF, MOVEMENT } from '../config.js';
import { InputManager } from './InputManager.js';
import { CameraController } from './CameraController.js';
import { TouchControls } from './TouchControls.js';
import { Arena } from '../systems/Arena.js';
import { PaintSystem } from '../systems/PaintSystem.js';
import { ProjectileManager } from '../systems/ProjectileManager.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Player } from '../entities/Player.js';
import { EnemyAI } from '../entities/EnemyAI.js';
import { UIManager } from '../ui/UIManager.js';

const _enemyScreenPos = new THREE.Vector3();
const _enemyMarkerOffset = new THREE.Vector3(0, 2.35, 0);

const STATE = {
  TITLE: 'title',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
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

    this._setupRenderer();
    this._setupScene();

    this.arena = new Arena();
    this.scene.add(this.arena.group);

    this.paintSystem = new PaintSystem(this.arena.halfWidth, this.arena.halfDepth);
    this.paintSystem.applyToMaterial(this.arena.floorMesh.material);

    this.input = new InputManager(this.canvas);
    this.touchControls = this.input.isTouch
      ? new TouchControls(this.input, document.getElementById('touch-controls'))
      : null;
    this.ui.applyTouchMode(this.input.isTouch);

    this.cameraController = new CameraController(this.camera);

    this.particleManager = new ParticleManager(this.scene);
    this.audioManager = new AudioManager();
    this.projectileManager = new ProjectileManager(
      this.scene, this.arena, this.paintSystem, this.particleManager, this.audioManager
    );
    this.projectileManager.onCharacterHit = (targetTeam, damage, hitPoint) => this._onCharacterHit(targetTeam, damage, hitPoint);

    this.player = new Player(this.arena.spawnPoints.player, this.cameraController, this.input);
    this.cpu = new EnemyAI(this.arena.spawnPoints.cpu);
    this.scene.add(this.player.mesh, this.cpu.mesh);
    this._setupCpuVisibilityAid();
    this._cpuHitFlashTimer = 0;

    this._faceSpawnPoints();

    this.state = STATE.TITLE;
    this.countdownRemaining = 0;
    this.matchTimeRemaining = MATCH.durationSec;
    this.elapsedTime = 0;

    this.debugMode = false;
    this.ui.setDebugVisible(false);

    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._fpsDisplay = 0;
    this._wasPlayerInkSurfing = false;

    this._bindUI();
    this._bindWindow();

    this.clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);

    // Exposed for manual QA in the browser console (e.g. `__game.debugMode = true`).
    window.__game = this;
    // Global debug helper, per spec: cycles the enemy's appearance type.
    window.cycleEnemyAppearance = () => this._cycleEnemyAppearance();
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERF.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if ('outputColorSpace' in this.renderer) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x263244);
    this.scene.fog = new THREE.Fog(0x263244, 42, 96);

    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 200);
    this._baseCameraFov = this.camera.fov;

    const ambient = new THREE.HemisphereLight(0xc8d8ee, 0x344052, 1.32);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.24);
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
    this.ui.bindStart(() => this._startMatch());
    this.ui.bindRestart(() => this._startMatch());
    this.ui.bindCycleAppearance(() => this._cycleEnemyAppearance());
  }

  /** Debug: advance the enemy's appearance type and re-show its intro banner. */
  _cycleEnemyAppearance() {
    this.cpu.cycleEnemyAppearance();
    this.cpu.consumeIntroBanner(); // shown directly below; avoid a duplicate next frame
    this.ui.showEnemyIntro(this.cpu.appearanceName, this.cpu.appearanceId, this.cpu.appearance.main);
  }

  _bindWindow() {
    const resize = () => this._resizeViewport();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.visualViewport?.addEventListener('resize', resize);
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
    this.projectileManager.reset();
    this.particleManager.reset();

    this.player.position.copy(this.arena.spawnPoints.player);
    this.player.velocity.set(0, 0, 0);
    this.player.hp = 100;
    this.player.ink = 100;
    this.player.alive = true;
    this.player.inkSurfActive = false;
    this.player.inkSurfCooldown = 0;
    this.player.invincibleTimer = 0;
    this.player.koScored = 0;
    this.player.deaths = 0;

    this.cpu.position.copy(this.arena.spawnPoints.cpu);
    this.cpu.velocity.set(0, 0, 0);
    this.cpu.hp = 100;
    this.cpu.ink = 100;
    this.cpu.alive = true;
    this.cpu.inkSurfActive = false;
    this.cpu.inkSurfCooldown = 0;
    this.cpu.invincibleTimer = 0;
    this.cpu.koScored = 0;
    this.cpu.deaths = 0;
    this.cpu.state = 'explore';
    this.cpu.targetPoint = this.cpu.position.clone();
    // Fresh random look each match; the entrance animation plays once the
    // countdown ends (see _updateCountdown), not during the reset.
    this.cpu.randomizeAppearance({ playIntro: false });

    this._faceSpawnPoints();

    this.matchTimeRemaining = MATCH.durationSec;
    this.countdownRemaining = MATCH.countdownSec + MATCH.startFlashSec;

    this.ui.hideTitle();
    this.ui.hideResultScreen();
    this.ui.showCountdown();
    this.ui.showHUD();
    this.ui.hideRespawnBanner();
    this.ui.updateEnemyMarker({ visible: false });
    this._cpuHitFlashTimer = 0;
    this._wasPlayerInkSurfing = false;
    this._currentCameraSink = 0;
    this.audioManager.stopInkSurfLoop();
    this.audioManager.stopBattleBGM();
    this.touchControls?.show();

    this._lastCountdownDigit = null;
    this.state = STATE.COUNTDOWN;

    this.audioManager.resume();
    this.input.requestPointerLock();
  }

  _endMatch() {
    this.state = STATE.RESULT;
    this.paintSystem.flush();
    this.input.exitPointerLock();
    this.touchControls?.hide();
    this.audioManager.stopBattleBGM();

    const cov = this.paintSystem.getCoverage();
    const outcome = cov.playerCells === cov.cpuCells ? 'draw' : (cov.playerCells > cov.cpuCells ? 'win' : 'lose');

    if (outcome === 'win') this.audioManager.playWin();
    else if (outcome === 'lose') this.audioManager.playLose();

    this.ui.showResult({
      playerPct: cov.playerPct,
      cpuPct: cov.cpuPct,
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
      outcome,
    });
  }

  _onCharacterHit(targetTeam, damage, hitPoint) {
    const target = targetTeam === TEAM.PLAYER ? this.player : this.cpu;
    const shooter = targetTeam === TEAM.PLAYER ? this.cpu : this.player;

    const died = target.takeDamage(damage);
    this.audioManager.playDamage();
    this.ui.flashCrosshair(targetTeam === TEAM.CPU);
    if (targetTeam === TEAM.PLAYER) this.ui.flashHit();
    if (targetTeam === TEAM.CPU) this._flashCpuBody();

    if (died) {
      shooter.koScored++;
      const color = targetTeam === TEAM.PLAYER ? COLORS.player : COLORS.cpu;
      this.particleManager.spawnKOExplosion(hitPoint, color);
      this.audioManager.playKO();
      this.ui.showStatusMessage(targetTeam === TEAM.PLAYER ? 'YOU WERE SPLATTED!' : 'CPU DEFEATED!', 1.8);
      if (targetTeam === TEAM.PLAYER) this.ui.showRespawnBanner();
    }
  }

  // ------------------------------------------------------------ main loop
  _animate() {
    requestAnimationFrame(this._animate);
    const rawDt = this.clock.getDelta();
    if (document.hidden) return;

    const dt = Math.min(rawDt, PERF.maxDeltaSec);
    this.elapsedTime += dt;

    this._updateFps(dt);
    this._update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    if (this.input.wasJustPressed('Backquote')) {
      this.debugMode = !this.debugMode;
      this.ui.setDebugVisible(this.debugMode);
    }

    // Debug: 'V' cycles the enemy appearance (Speed -> Street -> Heavy -> Technical).
    if (this.input.wasJustPressed('KeyV')) this._cycleEnemyAppearance();

    switch (this.state) {
      case STATE.TITLE:
        this._updateIdleCamera(dt);
        break;
      case STATE.COUNTDOWN:
        this._updateCountdown(dt);
        break;
      case STATE.PLAYING:
        this._updatePlaying(dt);
        break;
      case STATE.RESULT:
        this._updateResult(dt);
        break;
    }

    if (this.debugMode) this._updateDebugOverlay();
  }

  _updateIdleCamera(dt) {
    const [dx, dy] = this.input.consumeMouseDelta();
    if (this.input.pointerLocked || this.input.isTouch) this.cameraController.applyLook(dx, dy);
    this.cameraController.update(dt, this.player.position);
    this.player.syncMesh(this.elapsedTime);
    this.cpu.syncMesh(this.elapsedTime);
  }

  _updateCountdown(dt) {
    this.countdownRemaining -= dt;
    const [dx, dy] = this.input.consumeMouseDelta();
    if (this.input.pointerLocked || this.input.isTouch) this.cameraController.applyLook(dx, dy);
    this.cameraController.update(dt, this.player.position);
    this.player.syncMesh(this.elapsedTime);
    this.cpu.syncMesh(this.elapsedTime);

    const remaining = Math.max(0, this.countdownRemaining);
    let label;
    if (remaining > MATCH.startFlashSec) {
      label = String(Math.ceil(remaining - MATCH.startFlashSec));
    } else {
      label = 'START';
    }
    if (label !== this._lastCountdownDigit) {
      this._lastCountdownDigit = label;
      this.ui.setCountdownText(label);
      if (label === 'START') this.audioManager.playStart();
      else this.audioManager.playCountdownBeep();
    }

    if (this.countdownRemaining <= 0) {
      this.ui.hideCountdown();
      this.cpu.playIntro(); // enemy "appears" as play begins
      this.state = STATE.PLAYING;
      this.audioManager.playBattleBGM();
    }
  }

  _updatePlaying(dt) {
    this.matchTimeRemaining -= dt;
    const matchOver = this.matchTimeRemaining <= 0;
    this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining);

    const [dx, dy] = this.input.consumeMouseDelta();
    if (this.input.pointerLocked || this.input.isTouch) this.cameraController.applyLook(dx, dy);

    const ctx = {
      arena: this.arena,
      paintSystem: this.paintSystem,
      projectileManager: this.projectileManager,
      particleManager: this.particleManager,
      audioManager: this.audioManager,
      player: this.player,
      controlsEnabled: true,
      elapsedTime: this.elapsedTime,
    };

    this.player.update(dt, ctx);
    this.cpu.update(dt, ctx);

    // Show the archetype name banner when the enemy (re)appears.
    if (this.cpu.consumeIntroBanner()) {
      this.ui.showEnemyIntro(this.cpu.appearanceName, this.cpu.appearanceId, this.cpu.appearance.main);
    }

    this.projectileManager.update(dt, [this.player, this.cpu]);
    this.particleManager.update(dt);
    this.paintSystem.update(dt);

    this._updateSurfFeedback(dt, this.player.inkSurfActive);
    this.cameraController.update(dt, this.player.position, this._currentCameraSink);

    if (this.player.alive) this.ui.hideRespawnBanner();

    this.ui.tickStatusMessage(dt);
    this.ui.tickHitFlash(dt);
    this._updateCpuVisibility(dt);

    const cov = this.paintSystem.getCoverage();
    this.ui.updateHUD({
      timeRemaining: this.matchTimeRemaining,
      playerPct: cov.playerPct,
      cpuPct: cov.cpuPct,
      hp: this.player.hp,
      ink: this.player.ink,
      koPlayer: this.player.koScored,
      koCpu: this.cpu.koScored,
      firing: this.input.mouseDown && this.player.alive && !this.player.inkSurfActive,
      submerged: this.player.inkSurfActive,
      enemyFloor: this.player.onEnemyFloor,
    });

    if (matchOver) this._endMatch();
  }

  _updateResult(dt) {
    this.ui.updateEnemyMarker({ visible: false });
    this._updateSurfFeedback(dt, false);
    this.cameraController.update(dt, this.player.position);
    this.player.syncMesh(this.elapsedTime);
    this.cpu.syncMesh(this.elapsedTime);

    if (this.input.wasJustPressed('KeyR')) this._startMatch();
  }

  _updateSurfFeedback(dt, active) {
    const targetFov = this._baseCameraFov + (active ? MOVEMENT.inkSurfFovBoost : 0);
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

    this.cpuRing.visible = this.cpu.alive;
    if (!this.cpu.alive) {
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
    const info = [
      `state: ${this.state}`,
      `player cell: (${pgx}, ${pgz})  grounded:${this.player.grounded}`,
      `cpu    cell: (${cgx}, ${cgz})  grounded:${this.cpu.grounded}`,
      `cpu ai state: ${this.cpu.state}`,
      `cpu target: ${this.cpu.debugTarget ? this.cpu.debugTarget.toArray().map((n) => n.toFixed(1)).join(',') : '-'}`,
      `player inv: ${this.player.invincibleTimer.toFixed(2)}  cpu inv: ${this.cpu.invincibleTimer.toFixed(2)}`,
      `coverage P:${cov.playerPct.toFixed(1)}% C:${cov.cpuPct.toFixed(1)}% N:${(100 - cov.playerPct - cov.cpuPct).toFixed(1)}%`,
      `projectiles active: ${this.projectileManager.pool.filter((p) => p.active).length}/${this.projectileManager.pool.length}`,
      `particles active: ${this.particleManager.pool.filter((p) => p.active).length}/${this.particleManager.pool.length}`,
    ].join('\n');
    this.ui.updateDebug(this._fpsDisplay, info);
  }
}
