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

      timer: document.getElementById('timer'),
      coveragePlayerPct: document.getElementById('coverage-player-pct'),
      coverageCpuPct: document.getElementById('coverage-cpu-pct'),
      coverageBarPlayer: document.getElementById('coverage-bar-player'),
      coverageBarCpu: document.getElementById('coverage-bar-cpu'),
      statusMsg: document.getElementById('status-msg'),

      hpRow: document.getElementById('hp-row'),
      hpFill: document.getElementById('hp-fill'),
      hpValue: document.getElementById('hp-value'),
      inkRow: document.getElementById('ink-row'),
      inkFill: document.getElementById('ink-fill'),
      inkValue: document.getElementById('ink-value'),

      koPlayer: document.getElementById('ko-player'),
      koCpu: document.getElementById('ko-cpu'),

      crosshair: document.getElementById('crosshair'),
      enemyIntro: document.getElementById('enemy-intro'),
      enemyIntroType: document.getElementById('enemy-intro-type'),
      enemyIntroName: document.getElementById('enemy-intro-name'),
      enemyMarker: document.getElementById('enemy-marker'),
      enemyHpFill: document.getElementById('enemy-hp-fill'),
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
  }

  bindStart(cb) { this.el.btnStart.addEventListener('click', cb); }
  bindRestart(cb) { this.el.btnRestart.addEventListener('click', cb); }
  bindCycleAppearance(cb) { this.el.btnCycleAppearance?.addEventListener('click', cb); }

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

  updateHUD({ timeRemaining, playerPct, cpuPct, hp, ink, koPlayer, koCpu, firing, submerged = false, enemyFloor = false }) {
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
