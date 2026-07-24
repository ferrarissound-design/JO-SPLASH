import { ARENA } from '../config.js';

const MAP_COLORS = {
  neutralA: [17, 27, 44, 255],
  neutralB: [21, 34, 53, 255],
  player: [47, 184, 255, 255],
  cpu: [255, 122, 47, 255],
};

// ============================================================================
// UIManager — all DOM reads/writes live here. Game.js calls plain methods
// with already-computed numbers; this class never touches gameplay state
// directly, keeping the render logic and the DOM in one place.
// ============================================================================
export class UIManager {
  constructor() {
    this.el = {
      title: document.getElementById('screen-title'),
      howtoDesktop: document.getElementById('howto-desktop'),
      howtoTouch: document.getElementById('howto-touch'),
      countdown: document.getElementById('screen-countdown'),
      countdownNumber: document.getElementById('countdown-number'),
      hud: document.getElementById('hud'),
      result: document.getElementById('screen-result'),
      btnStart: document.getElementById('btn-start'),
      btnRestart: document.getElementById('btn-restart'),
      difficultyButtons: Array.from(document.querySelectorAll('[data-difficulty]')),
      cpuLevelLabel: document.getElementById('cpu-level-label'),

      timer: document.getElementById('timer'),
      coveragePlayerPct: document.getElementById('coverage-player-pct'),
      coverageCpuPct: document.getElementById('coverage-cpu-pct'),
      coverageBarPlayer: document.getElementById('coverage-bar-player'),
      coverageBarCpu: document.getElementById('coverage-bar-cpu'),
      statusMsg: document.getElementById('status-msg'),
      turfMap: document.getElementById('turf-map'),
      turfMapCanvas: document.getElementById('turf-map-canvas'),
      turfMapStatus: document.getElementById('turf-map-status'),

      hpRow: document.getElementById('hp-row'),
      hpFill: document.getElementById('hp-fill'),
      hpValue: document.getElementById('hp-value'),
      inkRow: document.getElementById('ink-row'),
      inkFill: document.getElementById('ink-fill'),
      inkValue: document.getElementById('ink-value'),
      specialRow: document.getElementById('special-row'),
      specialFill: document.getElementById('special-fill'),
      specialValue: document.getElementById('special-value'),
      weaponName: document.getElementById('weapon-name'),

      koPlayer: document.getElementById('ko-player'),
      koCpu: document.getElementById('ko-cpu'),

      crosshair: document.getElementById('crosshair'),
      enemyIntro: document.getElementById('enemy-intro'),
      enemyIntroType: document.getElementById('enemy-intro-type'),
      enemyIntroName: document.getElementById('enemy-intro-name'),
      enemyMarker: document.getElementById('enemy-marker'),
      enemyHpFill: document.getElementById('enemy-hp-fill'),
      enemySpecialWarning: document.getElementById('enemy-special-warning'),
      enemySpecialWarningLabel: document.getElementById('enemy-special-warning-label'),
      finalCountdown: document.getElementById('final-countdown'),
      finalCountdownValue: document.getElementById('final-countdown-value'),
      timeUpOverlay: document.getElementById('time-up-overlay'),
      inkRollFlash: document.getElementById('ink-roll-flash'),
      hitFlash: document.getElementById('hit-flash'),
      respawnBanner: document.getElementById('respawn-banner'),

      resultTitle: document.getElementById('result-title'),
      resultBarPlayer: document.getElementById('result-bar-player'),
      resultBarCpu: document.getElementById('result-bar-cpu'),
      resultPctPlayer: document.getElementById('result-pct-player'),
      resultPctCpu: document.getElementById('result-pct-cpu'),
      resultKoPlayer: document.getElementById('result-ko-player'),
      resultKoCpu: document.getElementById('result-ko-cpu'),

      debugOverlay: document.getElementById('debug-overlay'),
      debugFps: document.getElementById('debug-fps'),
      debugInfo: document.getElementById('debug-info'),
      btnCycleAppearance: document.getElementById('debug-cycle-appearance'),
    };

    this._statusMsgTimer = 0;
    this._hitFlashTimer = 0;
    this._countUpAnim = null;
    this._lastKoPlayer = 0;
    this._lastKoCpu = 0;
    this._crosshairTimer = 0;
    this._turfMapTimer = 0;
    this._turfMapCtx = this.el.turfMapCanvas?.getContext('2d') ?? null;
    this._turfMapImage = null;
    this.resetTurfMap();
  }

  bindStart(cb) { this.el.btnStart.addEventListener('click', cb); }
  bindRestart(cb) { this.el.btnRestart.addEventListener('click', cb); }
  bindCycleAppearance(cb) { this.el.btnCycleAppearance?.addEventListener('click', cb); }
  bindDifficultySelection(cb) {
    for (const button of this.el.difficultyButtons) {
      button.addEventListener('click', () => cb(button.dataset.difficulty));
    }
  }

  setDifficulty(id, label) {
    for (const button of this.el.difficultyButtons) {
      const selected = button.dataset.difficulty === id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    if (this.el.cpuLevelLabel) this.el.cpuLevelLabel.textContent = `CPU · ${label}`;
  }

  /** Flashes the enemy archetype name (e.g. "SPEED PUNK") on (re)appearance; CSS fades it out. */
  showEnemyIntro(name, id, color = '#ffffff') {
    const el = this.el.enemyIntro;
    if (!el) return;
    this.el.enemyIntroName.textContent = name || '';
    this.el.enemyIntroType.textContent = id ? id.toUpperCase() : '';
    el.style.setProperty('--intro-color', color);
    el.classList.remove('hidden', 'play');
    void el.offsetWidth; // restart the animation even on back-to-back calls
    el.classList.add('play');
  }

  /** Swaps the title screen's instructions panel and reserves HUD space for on-screen touch controls. */
  applyTouchMode(isTouch) {
    this.el.howtoDesktop.classList.toggle('hidden', isTouch);
    this.el.howtoTouch.classList.toggle('hidden', !isTouch);
    this.el.hud.classList.toggle('touch-mode', isTouch);
  }

  showTitle() { this.el.title.classList.remove('hidden'); }
  hideTitle() { this.el.title.classList.add('hidden'); }

  showCountdown() { this.el.countdown.classList.remove('hidden'); }
  hideCountdown() { this.el.countdown.classList.add('hidden'); }
  setCountdownText(text) { this.el.countdownNumber.textContent = text; }

  showHUD() { this.el.hud.classList.remove('hidden'); }
  hideHUD() { this.el.hud.classList.add('hidden'); }

  showResultScreen() { this.el.result.classList.remove('hidden'); }
  hideResultScreen() { this.el.result.classList.add('hidden'); }

  updateHUD({
    timeRemaining, playerPct, cpuPct, hp, ink, specialCharge = 0,
    specialReady = false, specialActive = false, weaponName = 'STREAM',
    koPlayer, koCpu, firing,
    submerged = false, rolling = false, enemyFloor = false,
  }) {
    const t = Math.max(0, Math.ceil(timeRemaining));
    const minutes = Math.floor(t / 60);
    const seconds = String(t % 60).padStart(2, '0');
    this.el.timer.textContent = `${String(minutes).padStart(2, '0')}:${seconds}`;
    this.el.timer.classList.toggle('time-low', t <= 10);

    this.el.coveragePlayerPct.textContent = `${playerPct.toFixed(0)}%`;
    this.el.coverageCpuPct.textContent = `${cpuPct.toFixed(0)}%`;
    this.el.coverageBarPlayer.style.width = `${playerPct}%`;
    this.el.coverageBarCpu.style.width = `${cpuPct}%`;

    this.el.hpFill.style.width = `${Math.max(0, hp)}%`;
    this.el.hpFill.classList.toggle('hp-low', hp <= 30);
    this.el.hpRow.classList.toggle('hp-alert', hp <= 30);
    this.el.hpValue.textContent = String(Math.ceil(hp));

    this.el.inkFill.style.width = `${Math.max(0, ink)}%`;
    this.el.inkRow.classList.toggle('ink-alert', ink <= 18);
    this.el.inkValue.textContent = String(Math.ceil(ink));

    const specialPct = Math.max(0, Math.min(100, specialCharge));
    this.el.specialFill.style.width = `${specialPct}%`;
    this.el.specialRow.classList.toggle('special-ready', specialReady);
    this.el.specialRow.classList.toggle('special-active', specialActive);
    this.el.specialValue.textContent = specialActive ? 'NOW' : specialReady ? 'Q!' : `${Math.floor(specialPct)}%`;
    this.el.weaponName.textContent = weaponName;

    if (koPlayer !== this._lastKoPlayer) {
      this.el.koPlayer.classList.remove('ko-pop');
      void this.el.koPlayer.offsetWidth;
      this.el.koPlayer.classList.add('ko-pop');
      this._lastKoPlayer = koPlayer;
    }
    if (koCpu !== this._lastKoCpu) {
      this.el.koCpu.classList.remove('ko-pop');
      void this.el.koCpu.offsetWidth;
      this.el.koCpu.classList.add('ko-pop');
      this._lastKoCpu = koCpu;
    }
    this.el.koPlayer.textContent = String(koPlayer);
    this.el.koCpu.textContent = String(koCpu);

    this.el.hud.classList.toggle('ink-submerged', submerged);
    this.el.hud.classList.toggle('ink-rolling', rolling);
    this.el.inkRollFlash?.classList.toggle('hidden', !rolling);
    this.el.inkRollFlash?.classList.toggle('active', rolling);
    this.el.hud.classList.toggle('enemy-ink-danger', enemyFloor);
    this.el.crosshair.classList.toggle('firing', firing && !submerged);
  }

  showStatusMessage(text, durationSec = 1.6) {
    this.el.statusMsg.textContent = text;
    this.el.statusMsg.classList.add('show');
    this._statusMsgTimer = durationSec;
  }

  tickStatusMessage(dt) {
    if (this._statusMsgTimer <= 0) return;
    this._statusMsgTimer -= dt;
    if (this._statusMsgTimer <= 0) this.el.statusMsg.classList.remove('show');
  }

  flashHit() {
    this.el.hitFlash.classList.remove('flash-fade');
    this.el.hitFlash.classList.add('flash');
    this._hitFlashTimer = 0.06;
  }

  tickHitFlash(dt) {
    if (this._hitFlashTimer > 0) {
      this._hitFlashTimer -= dt;
      if (this._hitFlashTimer <= 0) {
        this.el.hitFlash.classList.remove('flash');
        this.el.hitFlash.classList.add('flash-fade');
      }
    }
    if (this._crosshairTimer > 0) {
      this._crosshairTimer -= dt;
      if (this._crosshairTimer <= 0) this.el.crosshair.classList.remove('hit-confirm', 'enemy-hit');
    }
  }

  flashCrosshair(enemyHit = false) {
    this.el.crosshair.classList.remove('hit-confirm', 'enemy-hit');
    void this.el.crosshair.offsetWidth;
    this.el.crosshair.classList.add(enemyHit ? 'enemy-hit' : 'hit-confirm');
    this._crosshairTimer = 0.12;
  }

  updateEnemyMarker({ visible, x = 0, y = 0, hp = 100, scale = 1 }) {
    this.el.enemyMarker.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.el.enemyMarker.style.left = `${x}px`;
    this.el.enemyMarker.style.top = `${y}px`;
    this.el.enemyMarker.style.transform = `translate(-50%, -100%) scale(${scale})`;
    this.el.enemyHpFill.style.width = `${Math.max(0, hp)}%`;
  }

  updateEnemySpecialWarning({ visible, active = false }) {
    const el = this.el.enemySpecialWarning;
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    el.classList.toggle('active', visible && active);
    if (this.el.enemySpecialWarningLabel) {
      this.el.enemySpecialWarningLabel.textContent = active ? 'CPU INK BURST' : 'CPU BURST CHARGING';
    }
  }

  showFinalCountdown(second) {
    const el = this.el.finalCountdown;
    if (!el) return;
    this.el.finalCountdownValue.textContent = String(second);
    el.classList.remove('hidden', 'tick');
    el.classList.toggle('urgent', second <= 3);
    void el.offsetWidth;
    el.classList.add('tick');
  }

  hideFinalCountdown() {
    this.el.finalCountdown?.classList.add('hidden');
  }

  showTimeUp() {
    this.hideFinalCountdown();
    const el = this.el.timeUpOverlay;
    if (!el) return;
    el.classList.remove('hidden');
  }

  hideTimeUp() {
    this.el.timeUpOverlay?.classList.add('hidden');
  }

  resetFinale() {
    this.hideFinalCountdown();
    this.hideTimeUp();
    this.el.finalCountdown?.classList.remove('urgent', 'tick');
  }

  resetInkRollFeedback() {
    this.el.hud.classList.remove('ink-rolling');
    this.el.inkRollFlash?.classList.add('hidden');
    this.el.inkRollFlash?.classList.remove('active');
  }

  resetTurfMap() {
    const canvas = this.el.turfMapCanvas;
    const ctx = this._turfMapCtx;
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#111b2c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this._drawTurfMapStage(ctx, canvas.width);
    this._turfMapTimer = 0;
    this._turfMapImage = null;
    this.el.turfMap?.classList.remove('cpu-hidden');
    if (this.el.turfMap) {
      this.el.turfMap.dataset.cpuVisible = 'false';
      this.el.turfMap.dataset.playerCell = '-';
      this.el.turfMap.dataset.cpuCell = '-';
    }
    if (this.el.turfMapStatus) this.el.turfMapStatus.textContent = '塗装マップを準備中';
  }

  updateTurfMap(dt, {
    ownerGrid, gridRes, halfWidth, halfDepth,
    playerX, playerZ, playerYaw, playerAlive,
    cpuX, cpuZ, cpuYaw, cpuVisible,
    playerPct, cpuPct,
  }) {
    const canvas = this.el.turfMapCanvas;
    let ctx = this._turfMapCtx;
    if (!canvas || !ctx || !ownerGrid) return;

    this._turfMapTimer -= dt;
    if (this._turfMapTimer > 0) return;
    this._turfMapTimer = 0.12;

    if (canvas.width !== gridRes || canvas.height !== gridRes) {
      canvas.width = gridRes;
      canvas.height = gridRes;
      ctx = canvas.getContext('2d');
      this._turfMapCtx = ctx;
      this._turfMapImage = null;
    }
    if (!this._turfMapImage || this._turfMapImage.width !== gridRes) {
      this._turfMapImage = ctx.createImageData(gridRes, gridRes);
    }

    const pixels = this._turfMapImage.data;
    for (let i = 0; i < ownerGrid.length; i++) {
      const owner = ownerGrid[i];
      const x = i % gridRes;
      const z = Math.floor(i / gridRes);
      const color = owner === 1
        ? MAP_COLORS.player
        : owner === 2
          ? MAP_COLORS.cpu
          : ((x >> 3) + (z >> 3)) % 2
            ? MAP_COLORS.neutralA
            : MAP_COLORS.neutralB;
      const p = i * 4;
      pixels[p] = color[0];
      pixels[p + 1] = color[1];
      pixels[p + 2] = color[2];
      pixels[p + 3] = color[3];
    }
    ctx.putImageData(this._turfMapImage, 0, 0);
    this._drawTurfMapStage(ctx, gridRes);

    const toMap = (value, halfExtent) => ((value + halfExtent) / (halfExtent * 2)) * gridRes;
    const playerMapX = toMap(playerX, halfWidth);
    const playerMapZ = toMap(playerZ, halfDepth);
    const cpuMapX = toMap(cpuX, halfWidth);
    const cpuMapZ = toMap(cpuZ, halfDepth);
    if (playerAlive) this._drawTurfMapMarker(ctx, playerMapX, playerMapZ, playerYaw, '#2fb8ff');
    if (cpuVisible) this._drawTurfMapMarker(ctx, cpuMapX, cpuMapZ, cpuYaw, '#ff7a2f');

    const map = this.el.turfMap;
    if (map) {
      map.classList.toggle('cpu-hidden', !cpuVisible);
      map.dataset.cpuVisible = String(cpuVisible);
      map.dataset.playerCell = `${Math.round(playerMapX)},${Math.round(playerMapZ)}`;
      map.dataset.cpuCell = cpuVisible ? `${Math.round(cpuMapX)},${Math.round(cpuMapZ)}` : 'hidden';
    }
    if (this.el.turfMapStatus) {
      const enemyStatus = cpuVisible ? 'CPU表示中' : 'CPU潜伏または撃破中';
      this.el.turfMapStatus.textContent =
        `塗装マップ: YOU ${playerPct.toFixed(0)}%、CPU ${cpuPct.toFixed(0)}%、${enemyStatus}`;
    }
  }

  _drawTurfMapStage(ctx, size) {
    const platformSize = size * (ARENA.platformSize / ARENA.width);
    const platformStart = (size - platformSize) / 2;
    const rampWidth = size * (ARENA.rampWidth / ARENA.width);
    const rampLength = size * (ARENA.rampLength / ARENA.depth);
    const rampX = size / 2 + size * (ARENA.rampOffsetX / ARENA.width) - rampWidth / 2;
    const rampZ = platformStart + platformSize;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = Math.max(1, size / 128);
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.strokeStyle = 'rgba(255,242,122,.46)';
    ctx.strokeRect(platformStart, platformStart, platformSize, platformSize);
    ctx.strokeStyle = 'rgba(255,242,122,.28)';
    ctx.strokeRect(rampX, rampZ, rampWidth, rampLength);
    ctx.beginPath();
    ctx.moveTo(size / 2 - 4, 5);
    ctx.lineTo(size / 2, 1);
    ctx.lineTo(size / 2 + 4, 5);
    ctx.stroke();
    ctx.restore();
  }

  _drawTurfMapMarker(ctx, x, z, yaw, color) {
    const radius = Math.max(4, ctx.canvas.width * 0.035);
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-yaw);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = Math.max(1.4, ctx.canvas.width / 90);
    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowBlur = radius;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 1.55);
    ctx.lineTo(radius, radius);
    ctx.lineTo(0, radius * 0.55);
    ctx.lineTo(-radius, radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  showRespawnBanner() { this.el.respawnBanner.classList.remove('hidden'); }
  hideRespawnBanner() { this.el.respawnBanner.classList.add('hidden'); }

  /** Animates the result percentages counting up from 0 to their final values. */
  showResult({ playerPct, cpuPct, koPlayer, koCpu, outcome }) {
    this.el.resultTitle.textContent = outcome === 'win' ? 'VICTORY' : outcome === 'lose' ? 'DEFEAT' : 'DRAW';
    this.el.resultTitle.classList.remove('win', 'lose', 'draw');
    this.el.resultTitle.classList.add(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'draw');

    this.el.resultKoPlayer.textContent = String(koPlayer);
    this.el.resultKoCpu.textContent = String(koCpu);

    if (this._countUpAnim) cancelAnimationFrame(this._countUpAnim);
    const duration = 1100;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const p = playerPct * eased;
      const c = cpuPct * eased;
      this.el.resultBarPlayer.style.width = `${p}%`;
      this.el.resultBarCpu.style.width = `${c}%`;
      this.el.resultPctPlayer.textContent = `${p.toFixed(1)}%`;
      this.el.resultPctCpu.textContent = `${c.toFixed(1)}%`;
      if (t < 1) {
        this._countUpAnim = requestAnimationFrame(step);
      } else {
        this._countUpAnim = null;
    this._lastKoPlayer = 0;
    this._lastKoCpu = 0;
    this._crosshairTimer = 0;
      }
    };
    this._countUpAnim = requestAnimationFrame(step);

    this.showResultScreen();
  }

  setDebugVisible(visible) {
    this.el.debugOverlay.classList.toggle('hidden', !visible);
  }

  updateDebug(fps, infoText) {
    this.el.debugFps.textContent = `FPS: ${fps}`;
    this.el.debugInfo.textContent = infoText;
  }
}
