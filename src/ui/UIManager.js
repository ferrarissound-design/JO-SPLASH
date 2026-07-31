import { ARENA } from '../config.js';
import { DEFAULT_KEY_BINDINGS, detectGamepadLayout } from '../core/InputManager.js';
import {
  UI_TEXT_JA,
  getComboLabel,
  toJapaneseBattleRankTitle,
  toJapaneseBestLabel,
  toJapaneseEquipmentName,
  toJapaneseMvpLabel,
  toJapaneseRankName,
} from './UiText.js';

const KEY_LABEL_OVERRIDES = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift R',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl R',
  AltLeft: 'Alt',
  AltRight: 'Alt R',
  Tab: 'Tab',
  CapsLock: 'Caps',
  Enter: 'Enter',
  Backquote: '`',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Turns a KeyboardEvent.code into a short human-readable label for the keybind buttons. */
function codeToLabel(code) {
  if (!code) return '?';
  if (code in KEY_LABEL_OVERRIDES) return KEY_LABEL_OVERRIDES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

const MAP_COLORS = {
  neutralA: [17, 27, 44, 255],
  neutralB: [21, 34, 53, 255],
  player: [47, 184, 255, 255],
  cpu: [255, 122, 47, 255],
};

const GAMEPAD_LABELS = Object.freeze({
  standard: Object.freeze({
    heading: 'ゲームパッド操作',
    status: '● ゲームパッド接続中',
    fire: 'RT / RB',
    jump: 'A',
    surf: 'LB / LT',
    bomb: 'B',
    weapon: 'X',
    weaponWithDpad: 'X / D-PAD',
    special: 'Y',
    pause: 'MENU / OPTIONS',
    weaponHint: 'X / 十字キー',
  }),
  nintendo: Object.freeze({
    heading: 'Switch Proコントローラー操作',
    status: '● Switch Proコントローラー接続中',
    fire: 'ZR / R',
    jump: 'B',
    surf: 'ZL / L',
    bomb: 'A',
    weapon: 'Y',
    weaponWithDpad: 'Y / 十字キー',
    special: 'X',
    pause: '＋',
    weaponHint: 'Y / 十字キー',
  }),
});

// ============================================================================
// UIManager — all DOM reads/writes live here. Game.js calls plain methods
// with already-computed numbers; this class never touches gameplay state
// directly, keeping the render logic and the DOM in one place.
// ============================================================================
export class UIManager {
  constructor() {
    this.el = {
      title: document.getElementById('screen-title'),
      matchRecord: document.getElementById('match-record'),
      mrWins: document.getElementById('mr-wins'),
      mrLosses: document.getElementById('mr-losses'),
      mrDraws: document.getElementById('mr-draws'),
      mrAvgPct: document.getElementById('mr-avg-pct'),
      profileRank: document.getElementById('profile-rank'),
      profileLevel: document.getElementById('profile-level'),
      profileXpFill: document.getElementById('profile-xp-fill'),
      profileXpLabel: document.getElementById('profile-xp-label'),
      howtoDesktop: document.getElementById('howto-desktop'),
      howtoTouch: document.getElementById('howto-touch'),
      howtoGamepad: document.getElementById('howto-gamepad'),
      gamepadStatus: document.getElementById('gamepad-status'),
      pause: document.getElementById('screen-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnQuit: document.getElementById('btn-quit'),
      btnPause: document.getElementById('btn-pause'),
      howtoDesktopPause: document.getElementById('howto-desktop-pause'),
      howtoTouchPause: document.getElementById('howto-touch-pause'),
      howtoGamepadPause: document.getElementById('howto-gamepad-pause'),
      gamepadHeadings: Array.from(document.querySelectorAll('[data-gamepad-heading]')),
      gamepadLabels: Array.from(document.querySelectorAll('[data-gamepad-control]')),
      settings: document.getElementById('screen-settings'),
      btnOpenSettings: document.getElementById('btn-open-settings'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      settingSensitivity: document.getElementById('setting-sensitivity'),
      settingSensitivityValue: document.getElementById('setting-sensitivity-value'),
      settingMasterVolume: document.getElementById('setting-master-volume'),
      settingMasterVolumeValue: document.getElementById('setting-master-volume-value'),
      settingMusicVolume: document.getElementById('setting-music-volume'),
      settingMusicVolumeValue: document.getElementById('setting-music-volume-value'),
      settingInvertY: document.getElementById('setting-invert-y'),
      settingQuality: document.getElementById('setting-quality'),
      settingColorMode: document.getElementById('setting-color-mode'),
      settingCrosshairScale: document.getElementById('setting-crosshair-scale'),
      settingCrosshairScaleValue: document.getElementById('setting-crosshair-scale-value'),
      settingTouchLayout: document.getElementById('setting-touch-layout'),
      btnReplayTutorial: document.getElementById('btn-replay-tutorial'),
      keybindButtons: Array.from(document.querySelectorAll('.keybind-btn')),
      btnResetKeybinds: document.getElementById('btn-reset-keybinds'),
      countdown: document.getElementById('screen-countdown'),
      countdownNumber: document.getElementById('countdown-number'),
      rivalIntro: document.getElementById('screen-rival-intro'),
      rivalCard: document.getElementById('rival-card'),
      rivalRound: document.getElementById('rival-round'),
      rivalName: document.getElementById('rival-name'),
      rivalTagline: document.getElementById('rival-tagline'),
      rivalDialogue: document.getElementById('rival-dialogue'),
      hud: document.getElementById('hud'),
      result: document.getElementById('screen-result'),
      btnStart: document.getElementById('btn-start'),
      selectedCharacterName: document.getElementById('selected-character-name'),
      selectedCharacterTagline: document.getElementById('selected-character-tagline'),
      startCharacterName: document.getElementById('start-character-name'),
      playerCharacterName: document.getElementById('player-character-name'),
      btnRestart: document.getElementById('btn-restart'),
      characterButtons: Array.from(document.querySelectorAll('[data-character]')),
      difficultyButtons: Array.from(document.querySelectorAll('[data-difficulty]')),
      cpuLevelLabel: document.getElementById('cpu-level-label'),
      practiceModeToggle: document.getElementById('practice-mode-toggle'),
      stageButtons: Array.from(document.querySelectorAll('[data-stage]')),
      ruleButtons: Array.from(document.querySelectorAll('[data-rule]')),
      subWeaponButtons: Array.from(document.querySelectorAll('[data-subweapon]')),
      battleModeButtons: Array.from(document.querySelectorAll('[data-battle-mode]')),
      challengeBoard: document.getElementById('challenge-board'),
      rewardButtons: Array.from(document.querySelectorAll('[data-reward]')),
      cupProgress: document.getElementById('cup-progress'),
      btnResumeCup: document.getElementById('btn-resume-cup'),
      ruleHint: document.getElementById('rule-hint'),

      timer: document.getElementById('timer'),
      coveragePlayerPct: document.getElementById('coverage-player-pct'),
      coverageCpuPct: document.getElementById('coverage-cpu-pct'),
      coverageBarPlayer: document.getElementById('coverage-bar-player'),
      coverageBarCpu: document.getElementById('coverage-bar-cpu'),
      objectiveStatus: document.getElementById('objective-status'),
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
      subWeaponName: document.getElementById('sub-weapon-name'),
      subWeaponStatus: document.getElementById('sub-weapon-status'),
      weaponSwitchHint: document.getElementById('weapon-switch-hint'),
      chargeMeter: document.getElementById('charge-meter'),
      chargeFill: document.getElementById('charge-fill'),
      chargeValue: document.getElementById('charge-value'),

      koPlayer: document.getElementById('ko-player'),
      koCpu: document.getElementById('ko-cpu'),

      crosshair: document.getElementById('crosshair'),
      hitCombo: document.getElementById('hit-combo'),
      hitComboCount: document.getElementById('hit-combo-count'),
      hitComboLabel: document.getElementById('hit-combo-label'),
      damageDirection: document.getElementById('damage-direction'),
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
      timeUpTitle: document.getElementById('time-up-title'),
      inkRollFlash: document.getElementById('ink-roll-flash'),
      hitFlash: document.getElementById('hit-flash'),
      respawnBanner: document.getElementById('respawn-banner'),
      tutorialCard: document.getElementById('tutorial-card'),
      tutorialProgress: document.getElementById('tutorial-progress'),
      tutorialTitle: document.getElementById('tutorial-title'),
      tutorialInstruction: document.getElementById('tutorial-instruction'),
      btnSkipTutorial: document.getElementById('btn-skip-tutorial'),

      resultTitle: document.getElementById('result-title'),
      resultRank: document.getElementById('result-rank'),
      resultRankGrade: document.getElementById('result-rank-grade'),
      resultRankTitle: document.getElementById('result-rank-title'),
      resultRankScore: document.getElementById('result-rank-score'),
      resultMargin: document.getElementById('result-margin'),
      resultBarPlayer: document.getElementById('result-bar-player'),
      resultBarCpu: document.getElementById('result-bar-cpu'),
      resultPctPlayer: document.getElementById('result-pct-player'),
      resultPctCpu: document.getElementById('result-pct-cpu'),
      resultPctNeutral: document.getElementById('result-pct-neutral'),
      resultKoPlayer: document.getElementById('result-ko-player'),
      resultKoCpu: document.getElementById('result-ko-cpu'),
      resultStatSpecials: document.getElementById('result-stat-specials'),
      resultStatBombs: document.getElementById('result-stat-bombs'),
      resultStatClimbs: document.getElementById('result-stat-climbs'),
      resultStatRolls: document.getElementById('result-stat-rolls'),
      resultStatSkySplashes: document.getElementById('result-stat-sky-splashes'),
      resultStatBestCombos: document.getElementById('result-stat-best-combos'),
      resultObjective: document.getElementById('result-objective'),
      resultRewards: document.getElementById('result-rewards'),
      resultLoadout: document.getElementById('result-loadout'),
      resultMvp: document.getElementById('result-mvp'),
      resultBests: document.getElementById('result-bests'),
      resultXp: document.getElementById('result-xp'),
      resultLevel: document.getElementById('result-level'),
      resultXpGained: document.getElementById('result-xp-gained'),
      resultXpFill: document.getElementById('result-xp-fill'),
      resultLevelUp: document.getElementById('result-level-up'),
      resultRivalDialogue: document.getElementById('result-rival-dialogue'),
      cupSummary: document.getElementById('cup-summary'),

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
    this._hitComboTimer = 0;
    this._damageDirectionTimer = 0;
    this._turfMapTimer = 0;
    this._turfMapCtx = this.el.turfMapCanvas?.getContext('2d') ?? null;
    this._turfMapImage = null;
    this.resetTurfMap();
  }

  bindStart(cb) { this.el.btnStart.addEventListener('click', cb); }
  bindRestart(cb) { this.el.btnRestart.addEventListener('click', cb); }
  bindResume(cb) { this.el.btnResume?.addEventListener('click', cb); }
  bindQuit(cb) { this.el.btnQuit?.addEventListener('click', cb); }
  bindPause(cb) { this.el.btnPause?.addEventListener('click', cb); }

  bindOpenSettings(cb) { this.el.btnOpenSettings?.addEventListener('click', cb); }
  bindCloseSettings(cb) { this.el.btnCloseSettings?.addEventListener('click', cb); }
  bindReplayTutorial(cb) { this.el.btnReplayTutorial?.addEventListener('click', cb); }
  bindSkipTutorial(cb) { this.el.btnSkipTutorial?.addEventListener('click', cb); }

  bindSensitivityChange(cb) {
    const el = this.el.settingSensitivity;
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (this.el.settingSensitivityValue) this.el.settingSensitivityValue.textContent = `x${v.toFixed(1)}`;
      cb(v);
    });
  }

  bindMasterVolumeChange(cb) {
    const el = this.el.settingMasterVolume;
    if (!el) return;
    el.addEventListener('input', () => {
      const pct = parseInt(el.value, 10);
      if (this.el.settingMasterVolumeValue) this.el.settingMasterVolumeValue.textContent = `${pct}%`;
      cb(pct / 100);
    });
  }

  bindMusicVolumeChange(cb) {
    const el = this.el.settingMusicVolume;
    if (!el) return;
    el.addEventListener('input', () => {
      const pct = parseInt(el.value, 10);
      if (this.el.settingMusicVolumeValue) this.el.settingMusicVolumeValue.textContent = `${pct}%`;
      cb(pct / 100);
    });
  }

  bindInvertYChange(cb) {
    const el = this.el.settingInvertY;
    if (!el) return;
    el.addEventListener('change', () => cb(el.checked));
  }

  bindQualityChange(cb) {
    this.el.settingQuality?.addEventListener('change', () => cb(this.el.settingQuality.value));
  }

  bindColorModeChange(cb) {
    this.el.settingColorMode?.addEventListener('change', () => cb(this.el.settingColorMode.value));
  }

  bindCrosshairScaleChange(cb) {
    const el = this.el.settingCrosshairScale;
    if (!el) return;
    el.addEventListener('input', () => {
      const value = parseFloat(el.value);
      if (this.el.settingCrosshairScaleValue) {
        this.el.settingCrosshairScaleValue.textContent = `${Math.round(value * 100)}%`;
      }
      cb(value);
    });
  }

  bindTouchLayoutChange(cb) {
    this.el.settingTouchLayout?.addEventListener('change', () => cb(this.el.settingTouchLayout.value));
  }

  /** cb(action, buttonEl) fires when a keybind "変更" button is clicked. */
  bindKeybindButtons(cb) {
    for (const btn of this.el.keybindButtons) {
      btn.addEventListener('click', () => cb(btn.dataset.action, btn));
    }
  }

  bindResetKeybinds(cb) { this.el.btnResetKeybinds?.addEventListener('click', cb); }

  /** Toggles a keybind button into/out of its "press a key..." capture state. */
  setKeybindListening(button, isListening) {
    if (!button) return;
    button.classList.toggle('listening', isListening);
    if (isListening) button.textContent = '入力待ち…';
  }

  /** Refreshes every keybind button's label from the effective (default + override) bindings. */
  updateKeybindLabels(keyBindingOverrides = {}) {
    for (const btn of this.el.keybindButtons) {
      const action = btn.dataset.action;
      const code = keyBindingOverrides[action] ?? DEFAULT_KEY_BINDINGS[action];
      btn.textContent = codeToLabel(code);
      btn.classList.remove('listening');
    }
  }

  /** Syncs slider positions/labels to persisted values whenever the settings screen opens. */
  setSettingsValues({
    sensitivityMult, masterVolume, musicVolume, invertY,
    quality = 'auto', colorMode = 'standard', crosshairScale = 1, touchLayout = 'standard',
  }) {
    if (this.el.settingSensitivity) {
      this.el.settingSensitivity.value = String(sensitivityMult);
      if (this.el.settingSensitivityValue) this.el.settingSensitivityValue.textContent = `x${sensitivityMult.toFixed(1)}`;
    }
    if (this.el.settingMasterVolume) {
      const pct = Math.round(masterVolume * 100);
      this.el.settingMasterVolume.value = String(pct);
      if (this.el.settingMasterVolumeValue) this.el.settingMasterVolumeValue.textContent = `${pct}%`;
    }
    if (this.el.settingMusicVolume) {
      const pct = Math.round(musicVolume * 100);
      this.el.settingMusicVolume.value = String(pct);
      if (this.el.settingMusicVolumeValue) this.el.settingMusicVolumeValue.textContent = `${pct}%`;
    }
    if (this.el.settingInvertY) this.el.settingInvertY.checked = Boolean(invertY);
    if (this.el.settingQuality) this.el.settingQuality.value = quality;
    if (this.el.settingColorMode) this.el.settingColorMode.value = colorMode;
    if (this.el.settingCrosshairScale) {
      this.el.settingCrosshairScale.value = String(crosshairScale);
      if (this.el.settingCrosshairScaleValue) {
        this.el.settingCrosshairScaleValue.textContent = `${Math.round(crosshairScale * 100)}%`;
      }
    }
    if (this.el.settingTouchLayout) this.el.settingTouchLayout.value = touchLayout;
  }

  showSettings() { this.el.settings?.classList.remove('hidden'); }
  hideSettings() { this.el.settings?.classList.add('hidden'); }
  bindCycleAppearance(cb) { this.el.btnCycleAppearance?.addEventListener('click', cb); }
  bindCharacterSelection(cb) {
    for (const button of this.el.characterButtons) {
      button.addEventListener('click', () => cb(button.dataset.character));
    }
  }
  bindDifficultySelection(cb) {
    for (const button of this.el.difficultyButtons) {
      button.addEventListener('click', () => cb(button.dataset.difficulty));
    }
  }
  bindPracticeModeChange(cb) {
    this.el.practiceModeToggle?.addEventListener('change', () => cb(this.el.practiceModeToggle.checked));
  }

  setPracticeMode(checked) {
    if (this.el.practiceModeToggle) this.el.practiceModeToggle.checked = Boolean(checked);
  }

  _bindOptionButtons(buttons, dataKey, cb) {
    for (const button of buttons) {
      button.addEventListener('click', () => {
        for (const candidate of buttons) {
          const selected = candidate === button;
          candidate.classList.toggle('selected', selected);
          candidate.setAttribute('aria-pressed', String(selected));
        }
        cb(button.dataset[dataKey]);
      });
    }
  }

  bindStageSelection(cb) { this._bindOptionButtons(this.el.stageButtons, 'stage', cb); }
  bindRuleSelection(cb) { this._bindOptionButtons(this.el.ruleButtons, 'rule', cb); }
  bindSubWeaponSelection(cb) { this._bindOptionButtons(this.el.subWeaponButtons, 'subweapon', cb); }
  bindBattleModeSelection(cb) { this._bindOptionButtons(this.el.battleModeButtons, 'battleMode', cb); }
  bindResumeCup(cb) { this.el.btnResumeCup?.addEventListener('click', cb); }
  bindRewardSelection(cb) {
    for (const button of this.el.rewardButtons) button.addEventListener('click', () => cb(button.dataset.reward));
  }

  _setOptionSelection(buttons, dataKey, value) {
    for (const button of buttons) {
      const selected = button.dataset[dataKey] === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  setStage(id) { this._setOptionSelection(this.el.stageButtons, 'stage', id); }
  setBattleMode(id) { this._setOptionSelection(this.el.battleModeButtons, 'battleMode', id); }

  setPlayerProfile({ level = 1, rankName = 'ROOKIE', current = 0, required = 100 } = {}) {
    if (this.el.profileRank) this.el.profileRank.textContent = toJapaneseRankName(rankName);
    if (this.el.profileLevel) this.el.profileLevel.textContent = String(level);
    if (this.el.profileXpFill) {
      this.el.profileXpFill.style.width = `${required > 0 ? Math.min(100, current / required * 100) : 100}%`;
    }
    if (this.el.profileXpLabel) this.el.profileXpLabel.textContent = `経験値 ${current} / ${required}`;
  }

  setChallengeBoard(challenges, unlocked) {
    if (!this.el.challengeBoard) return;
    const done = unlocked instanceof Set ? unlocked : new Set(unlocked ?? []);
    this.el.challengeBoard.innerHTML = `<b>チャレンジ</b><br>${challenges.map((challenge) => (
      `<span class="${done.has(challenge.id) ? 'done' : ''}">${done.has(challenge.id) ? '✓' : '○'} ${challenge.labelJa ?? challenge.label} — 報酬: ${challenge.rewardJa ?? challenge.reward}</span>`
    )).join('<br>')}`;
  }

  setResultMeta({ ruleLabel = '', objective = '', cup = '', rewards = [] } = {}) {
    if (this.el.resultObjective) {
      const text = [ruleLabel, objective, cup].filter(Boolean).join(' · ');
      this.el.resultObjective.textContent = text;
      this.el.resultObjective.classList.toggle('hidden', !text);
    }
    if (this.el.resultRewards) {
      this.el.resultRewards.textContent = rewards.length ? `解放した報酬: ${rewards.join(' / ')}` : '';
      this.el.resultRewards.classList.toggle('hidden', rewards.length === 0);
    }
  }

  setRestartLabel(label) {
    if (this.el.btnRestart) this.el.btnRestart.textContent = label;
  }

  setObjectiveStatus(text) {
    if (this.el.objectiveStatus) this.el.objectiveStatus.textContent = text;
  }

  setRuleHint(rule) {
    if (this.el.ruleHint) {
      this.el.ruleHint.textContent = `${rule.labelJa ?? rule.label} — ${rule.descriptionJa ?? rule.description}`;
    }
  }

  setRewardLoadout(availableRewards, equipped = {}) {
    const availableIds = availableRewards instanceof Set
      ? availableRewards
      : new Set(availableRewards ?? []);
    for (const button of this.el.rewardButtons) {
      const available = availableIds.has(button.dataset.reward);
      const isEquipped = Object.values(equipped).includes(button.dataset.reward);
      button.disabled = !available;
      button.classList.toggle('equipped', isEquipped);
      button.setAttribute('aria-pressed', String(isEquipped));
      button.title = available
        ? (isEquipped ? '装備中' : 'クリックして装備')
        : '対応するチャレンジを達成すると解放';
    }
  }

  setCupProgress({ visible = false, round = 0, wins = 0, rival = null, resumeAvailable = false } = {}) {
    if (this.el.cupProgress) {
      this.el.cupProgress.innerHTML = visible && rival
        ? `<strong>ライバルカップ ${round}/3 — ${rival.nameJa ?? rival.name}</strong><br>${rival.taglineJa ?? rival.tagline}<br>現在 ${wins}勝`
        : '';
      this.el.cupProgress.classList.toggle('hidden', !visible || !rival);
    }
    this.el.btnResumeCup?.classList.toggle('hidden', !resumeAvailable);
  }

  setCupSummary({ visible = false, results = [], wins = 0, champion = false } = {}) {
    if (!this.el.cupSummary) return;
    this.el.cupSummary.innerHTML = visible
      ? `<strong>${champion ? 'ライバルカップ王者' : 'ライバルカップ完走'}</strong><br>${results.map((result, index) => `第${index + 1}戦: ${UI_TEXT_JA.cupResult[result] ?? result}`).join(' · ')}<br>合計 ${wins}勝${champion ? '<br>クロマクラウンを獲得！' : ''}`
      : '';
    this.el.cupSummary.classList.toggle('hidden', !visible);
    this.el.cupSummary.classList.toggle('champion', visible && champion);
  }

  showRivalCard({ rival, round = 1, final = false } = {}) {
    if (!rival || !this.el.rivalIntro) return;
    this.el.rivalRound.textContent = final ? `最終ライバル · ${round}/3` : `ライバルカップ ${round}/3`;
    this.el.rivalName.textContent = rival.nameJa ?? rival.name;
    this.el.rivalTagline.textContent = rival.taglineJa ?? rival.tagline;
    this.el.rivalDialogue.textContent = `“${rival.introLineJa ?? rival.introLine ?? 'インクで決着をつけよう。'}”`;
    this.el.rivalCard.style.setProperty('--rival-color', rival.color ?? '#2fb8ff');
    this.el.rivalCard.classList.toggle('final', final);
    this.el.rivalIntro.classList.remove('hidden');
  }

  hideRivalCard() {
    this.el.rivalIntro?.classList.add('hidden');
  }

  showTutorialStep(step, progress = '') {
    if (!step || !this.el.tutorialCard) return;
    this.el.tutorialProgress.textContent = progress;
    this.el.tutorialTitle.textContent = step.title;
    this.el.tutorialInstruction.textContent = step.instruction;
    this.el.tutorialCard.classList.remove('hidden');
  }

  hideTutorial() {
    this.el.tutorialCard?.classList.add('hidden');
  }

  setResultPerformance({
    weaponName = '', subWeaponName = '', mvp = '', bestLabels = [],
  } = {}) {
    if (this.el.resultLoadout) {
      this.el.resultLoadout.textContent = `装備: ${toJapaneseEquipmentName(weaponName)} + ${toJapaneseEquipmentName(subWeaponName)}`;
    }
    if (this.el.resultMvp) this.el.resultMvp.textContent = `最優秀: ${toJapaneseMvpLabel(mvp)}`;
    if (this.el.resultBests) {
      this.el.resultBests.textContent = bestLabels.length
        ? `自己ベスト更新: ${bestLabels.map(toJapaneseBestLabel).join(' / ')}`
        : '';
    }
  }

  setResultXp({
    visible = false, xpGained = 0, level = 1, rankName = 'ROOKIE',
    current = 0, required = 100, leveledUp = false,
  } = {}) {
    if (!this.el.resultXp) return;
    this.el.resultXp.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.el.resultLevel.textContent = `レベル ${level} · ${toJapaneseRankName(rankName)}`;
    this.el.resultXpGained.textContent = `経験値 +${xpGained}`;
    this.el.resultXpFill.style.width = `${required > 0 ? Math.min(100, current / required * 100) : 100}%`;
    this.el.resultLevelUp.textContent = leveledUp ? `レベルアップ！ ${toJapaneseRankName(rankName)}に昇格。` : '';
  }

  setResultRivalDialogue(text = '') {
    if (!this.el.resultRivalDialogue) return;
    this.el.resultRivalDialogue.textContent = text ? `“${text}”` : '';
    this.el.resultRivalDialogue.classList.toggle('hidden', !text);
  }

  setCharacter(id, name = '', tagline = '') {
    for (const button of this.el.characterButtons) {
      const selected = button.dataset.character === id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    if (this.el.selectedCharacterName) this.el.selectedCharacterName.textContent = name;
    if (this.el.selectedCharacterTagline) this.el.selectedCharacterTagline.textContent = tagline;
    if (this.el.startCharacterName) this.el.startCharacterName.textContent = name;
    if (this.el.playerCharacterName) this.el.playerCharacterName.textContent = name;
    if (this.el.btnStart) this.el.btnStart.setAttribute('aria-label', `${name}でスタート`);
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
  showEnemyIntro(name, typeLabel, color = '#ffffff') {
    const el = this.el.enemyIntro;
    if (!el) return;
    this.el.enemyIntroName.textContent = name || '';
    this.el.enemyIntroType.textContent = typeLabel || '';
    el.style.setProperty('--intro-color', color);
    el.classList.remove('hidden', 'play');
    void el.offsetWidth; // restart the animation even on back-to-back calls
    el.classList.add('play');
  }

  /** Swaps the title screen's instructions panel and reserves HUD space for on-screen touch controls. */
  applyTouchMode(isTouch) {
    this._isTouch = isTouch;
    this.el.hud.classList.toggle('touch-mode', isTouch);
    this._updateInputHelp();
  }

  /** Shows gamepad-specific controls whenever a standard-mapped pad is active. */
  setGamepadMode(connected, name = '') {
    this._gamepadConnected = connected;
    this._gamepadLayout = connected ? detectGamepadLayout(name) : 'standard';
    const labels = GAMEPAD_LABELS[this._gamepadLayout];
    this.el.gamepadStatus?.classList.toggle('hidden', !connected);
    if (this.el.gamepadStatus) {
      this.el.gamepadStatus.title = name || '';
      this.el.gamepadStatus.textContent = connected ? labels.status : '';
    }
    for (const heading of this.el.gamepadHeadings || []) heading.textContent = labels.heading;
    for (const label of this.el.gamepadLabels || []) {
      label.textContent = labels[label.dataset.gamepadControl] || label.textContent;
    }
    this._updateInputHelp();
  }

  _updateInputHelp() {
    const useGamepad = !!this._gamepadConnected;
    const useTouch = !useGamepad && !!this._isTouch;
    this.el.howtoDesktop?.classList.toggle('hidden', useGamepad || useTouch);
    this.el.howtoTouch?.classList.toggle('hidden', useGamepad || !useTouch);
    this.el.howtoGamepad?.classList.toggle('hidden', !useGamepad);
    this.el.howtoDesktopPause?.classList.toggle('hidden', useGamepad || useTouch);
    this.el.howtoTouchPause?.classList.toggle('hidden', useGamepad || !useTouch);
    this.el.howtoGamepadPause?.classList.toggle('hidden', !useGamepad);
    const gamepadLabels = GAMEPAD_LABELS[this._gamepadLayout || 'standard'];
    this.el.weaponSwitchHint.textContent = useGamepad ? gamepadLabels.weaponHint : (useTouch ? '選択' : '1 / 2 / 3');
  }

  showTitle() { this.el.title.classList.remove('hidden'); }
  hideTitle() { this.el.title.classList.add('hidden'); }

  /** Shows the lifetime win/loss/draw record on the title screen, hidden until a first match completes. */
  updateMatchRecord(matchRecord) {
    const el = this.el.matchRecord;
    if (!el) return;
    if (matchRecord.totalMatches <= 0) {
      el.classList.add('hidden');
      return;
    }
    this.el.mrWins.textContent = String(matchRecord.values.wins);
    this.el.mrLosses.textContent = String(matchRecord.values.losses);
    this.el.mrDraws.textContent = String(matchRecord.values.draws);
    this.el.mrAvgPct.textContent = `${matchRecord.averagePlayerPct.toFixed(1)}%`;
    el.classList.remove('hidden');
  }

  showPause() { this.el.pause?.classList.remove('hidden'); }
  hidePause() { this.el.pause?.classList.add('hidden'); }

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
    weaponUsesCharge = false, weaponCharge = 0,
    weaponCharging = false, weaponChargeReady = false,
    weaponChargeStored = false, weaponChargeStoreTimer = 0,
    weaponChargeStoreDuration = 0,
    subWeaponName = 'INK BOMB', subWeaponCooldown = 0, subWeaponCost = 0,
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
    this.el.specialValue.textContent = specialActive ? '発動中' : specialReady ? 'Q!' : `${Math.floor(specialPct)}%`;
    this.el.weaponName.textContent = toJapaneseEquipmentName(weaponName);
    if (this.el.subWeaponName) this.el.subWeaponName.textContent = toJapaneseEquipmentName(subWeaponName);
    if (this.el.subWeaponStatus) {
      const lowInk = ink < subWeaponCost;
      this.el.subWeaponStatus.textContent = subWeaponCooldown > 0 ? `${subWeaponCooldown.toFixed(1)}秒` : lowInk ? 'インク不足' : '使用可能';
      this.el.subWeaponStatus.classList.toggle('cooldown', subWeaponCooldown > 0);
      this.el.subWeaponStatus.classList.toggle('low-ink', lowInk);
    }
    const chargePct = Math.max(0, Math.min(1, weaponCharge));
    this.el.chargeMeter?.classList.toggle('hidden', !weaponUsesCharge);
    this.el.chargeMeter?.classList.toggle('charging', weaponCharging && !weaponChargeReady);
    this.el.chargeMeter?.classList.toggle('ready', weaponChargeReady && !weaponChargeStored);
    this.el.chargeMeter?.classList.toggle('stored', weaponChargeStored);
    const storeRatio = weaponChargeStoreDuration > 0
      ? Math.max(0, Math.min(1, weaponChargeStoreTimer / weaponChargeStoreDuration))
      : 0;
    if (this.el.chargeFill) {
      this.el.chargeFill.style.width = `${(weaponChargeStored ? storeRatio : chargePct) * 100}%`;
    }
    if (this.el.chargeValue) {
      this.el.chargeValue.textContent = weaponChargeStored
        ? `キープ ${weaponChargeStoreTimer.toFixed(1)}`
        : weaponChargeReady ? '最大' : `${Math.floor(chargePct * 100)}%`;
    }

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
    this.el.hud.classList.toggle('precision-charging', weaponCharging);
    this.el.hud.classList.toggle('precision-ready', weaponChargeReady && !weaponChargeStored);
    this.el.hud.classList.toggle('precision-stored', weaponChargeStored);
    this.el.inkRollFlash?.classList.toggle('hidden', !rolling);
    this.el.inkRollFlash?.classList.toggle('active', rolling);
    this.el.hud.classList.toggle('enemy-ink-danger', enemyFloor);
    this.el.crosshair.classList.toggle('firing', firing && !submerged);
  }

  showStatusMessage(text, durationSec = 1.6) {
    this.el.statusMsg.textContent = text;
    this.el.statusMsg.classList.remove('sky-splash');
    this.el.statusMsg.classList.add('show');
    this._statusMsgTimer = durationSec;
  }

  clearStatusMessage() {
    this._statusMsgTimer = 0;
    this.el.statusMsg.textContent = '';
    this.el.statusMsg.classList.remove('show', 'sky-splash');
  }

  showSkySplash(count) {
    this.el.statusMsg.textContent = `空中命中 ×${count}`;
    this.el.statusMsg.classList.add('show', 'sky-splash');
    this._statusMsgTimer = 1;
  }

  showHitCombo(count, { skySplash = false } = {}) {
    if (!this.el.hitCombo || count < 2) return;

    const label = getComboLabel(count);
    this.el.hitComboCount.textContent = `${count}×`;
    this.el.hitComboLabel.textContent = label;
    this.el.hitCombo.classList.remove('hidden', 'pop', 'combo-sky');
    void this.el.hitCombo.offsetWidth;
    this.el.hitCombo.classList.add('pop');
    this.el.hitCombo.classList.toggle('combo-sky', skySplash);
    this._hitComboTimer = 0.9;
  }

  tickHitCombo(dt) {
    if (this._hitComboTimer <= 0) return;
    this._hitComboTimer = Math.max(0, this._hitComboTimer - dt);
    if (this._hitComboTimer === 0) this.resetHitCombo();
  }

  resetHitCombo() {
    this._hitComboTimer = 0;
    this.el.hitCombo?.classList.add('hidden');
    this.el.hitCombo?.classList.remove('pop', 'combo-sky');
  }

  tickStatusMessage(dt) {
    if (this._statusMsgTimer <= 0) return;
    this._statusMsgTimer -= dt;
    if (this._statusMsgTimer <= 0) this.el.statusMsg.classList.remove('show', 'sky-splash');
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
      if (this._crosshairTimer <= 0) this.el.crosshair.classList.remove('hit-confirm', 'enemy-hit', 'sky-hit');
    }
  }

  flashCrosshair(enemyHit = false, skySplash = false) {
    this.el.crosshair.classList.remove('hit-confirm', 'enemy-hit', 'sky-hit');
    void this.el.crosshair.offsetWidth;
    this.el.crosshair.classList.add(skySplash ? 'sky-hit' : enemyHit ? 'enemy-hit' : 'hit-confirm');
    this._crosshairTimer = skySplash ? 0.28 : 0.12;
  }

  showDamageDirection(angleRad, lethal = false) {
    const el = this.el.damageDirection;
    if (!el || !Number.isFinite(angleRad)) return;
    el.style.setProperty('--damage-angle', `${angleRad}rad`);
    el.classList.remove('hidden', 'pulse', 'lethal');
    void el.offsetWidth;
    el.classList.add('pulse');
    el.classList.toggle('lethal', lethal);
    this._damageDirectionTimer = lethal ? 1.05 : 0.78;
  }

  tickDamageDirection(dt) {
    if (this._damageDirectionTimer <= 0) return;
    this._damageDirectionTimer -= dt;
    if (this._damageDirectionTimer <= 0) this.hideDamageDirection();
  }

  hideDamageDirection() {
    this._damageDirectionTimer = 0;
    this.el.damageDirection?.classList.add('hidden');
    this.el.damageDirection?.classList.remove('pulse', 'lethal');
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
      this.el.enemySpecialWarningLabel.textContent = active ? 'CPUがインクバースト発動' : 'CPUがバースト準備中';
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

  showTimeUp(title = 'タイムアップ！') {
    this.hideFinalCountdown();
    const el = this.el.timeUpOverlay;
    if (!el) return;
    if (this.el.timeUpTitle) this.el.timeUpTitle.textContent = title;
    el.classList.remove('hidden');
  }

  hideTimeUp() {
    this.el.timeUpOverlay?.classList.add('hidden');
  }

  /** Toggles the HUD timer's overtime look — recolored and pulsing. */
  setSuddenDeathActive(active) {
    this.el.timer?.classList.toggle('sudden-death', active);
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
    if (playerAlive) this._drawTurfMapMarker(ctx, playerMapX, playerMapZ, playerYaw, '#2fb8ff', true);
    if (cpuVisible) this._drawTurfMapMarker(ctx, cpuMapX, cpuMapZ, cpuYaw, '#ff7a2f', false);

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
        `塗装マップ: あなた ${playerPct.toFixed(0)}%、CPU ${cpuPct.toFixed(0)}%、${enemyStatus}`;
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

  /**
   * isPlayer picks the marker's silhouette (chevron vs diamond) so the two
   * sides read apart by shape as well as hue — useful for colorblind players
   * since this is otherwise the map's only cyan-vs-orange distinction.
   */
  _drawTurfMapMarker(ctx, x, z, yaw, color, isPlayer = true) {
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
    if (isPlayer) {
      // Chevron/arrow — the original marker shape.
      ctx.moveTo(0, -radius * 1.55);
      ctx.lineTo(radius, radius);
      ctx.lineTo(0, radius * 0.55);
      ctx.lineTo(-radius, radius);
    } else {
      // Diamond — distinct silhouette, still yaw-oriented via the same rotate above.
      ctx.moveTo(0, -radius * 1.35);
      ctx.lineTo(radius * 0.95, 0);
      ctx.lineTo(0, radius * 1.35);
      ctx.lineTo(-radius * 0.95, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  showRespawnBanner() { this.el.respawnBanner.classList.remove('hidden'); }
  hideRespawnBanner() { this.el.respawnBanner.classList.add('hidden'); }

  showBattleRank(rank) {
    if (!rank || !this.el.resultRank) return;

    const rankClass = rank.practice ? 'rank-practice' : `rank-${String(rank.grade).toLowerCase()}`;
    this.el.resultRank.classList.remove('rank-s', 'rank-a', 'rank-b', 'rank-c', 'rank-practice', 'pop');
    this.el.resultRank.classList.add(rankClass);
    if (this.el.resultRankGrade) this.el.resultRankGrade.textContent = rank.practice ? '練習' : rank.grade;
    if (this.el.resultRankTitle) {
      this.el.resultRankTitle.textContent = rank.titleJa ?? toJapaneseBattleRankTitle(rank.title);
    }
    if (this.el.resultRankScore) {
      this.el.resultRankScore.textContent = rank.practice
        ? 'スコアなし — 練習モード'
        : `バトルスコア ${rank.score}`;
    }

    // Restart the reveal animation when playing consecutive matches.
    void this.el.resultRank.offsetWidth;
    this.el.resultRank.classList.add('pop');
  }

  /** Animates the result percentages counting up from 0 to their final values. */
  showResult({ playerPct, cpuPct, koPlayer, koCpu, outcome, stats = null, rank = null, suddenDeath = false }) {
    this.el.resultTitle.textContent = UI_TEXT_JA.outcome[outcome] ?? UI_TEXT_JA.outcome.draw;
    this.el.resultTitle.classList.remove('win', 'lose', 'draw');
    this.el.resultTitle.classList.add(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'draw');
    this.showBattleRank(rank);

    const margin = Math.abs(playerPct - cpuPct);
    const CLOSE_MATCH_THRESHOLD_PCT = 4;
    if (this.el.resultMargin) {
      if (suddenDeath) {
        this.el.resultMargin.textContent = outcome === 'draw'
          ? 'サドンデス、決着つかず引き分け'
          : 'サドンデスの末に決着！';
        this.el.resultMargin.classList.remove('hidden');
      } else if (outcome !== 'draw' && margin <= CLOSE_MATCH_THRESHOLD_PCT) {
        this.el.resultMargin.textContent = `接戦でした！差はわずか ${margin.toFixed(1)}%`;
        this.el.resultMargin.classList.remove('hidden');
      } else {
        this.el.resultMargin.classList.add('hidden');
      }
    }
    if (this.el.resultPctNeutral) {
      const neutralPct = Math.max(0, 100 - playerPct - cpuPct);
      this.el.resultPctNeutral.textContent = `${neutralPct.toFixed(1)}%`;
    }

    this.el.resultKoPlayer.textContent = String(koPlayer);
    this.el.resultKoCpu.textContent = String(koCpu);

    if (stats) {
      if (this.el.resultStatSpecials) this.el.resultStatSpecials.textContent = `${stats.specials.player} / ${stats.specials.cpu}`;
      if (this.el.resultStatBombs) this.el.resultStatBombs.textContent = `${stats.bombs.player} / ${stats.bombs.cpu}`;
      if (this.el.resultStatClimbs) this.el.resultStatClimbs.textContent = `${stats.climbs.player} / ${stats.climbs.cpu}`;
      // CPU never ink-rolls (player-only mechanic), so this line is YOU-only.
      if (this.el.resultStatRolls) this.el.resultStatRolls.textContent = String(stats.inkRolls.player);
      if (this.el.resultStatSkySplashes) {
        this.el.resultStatSkySplashes.textContent = `${stats.skySplashes?.player ?? 0} / ${stats.skySplashes?.cpu ?? 0}`;
      }
      if (this.el.resultStatBestCombos) {
        this.el.resultStatBestCombos.textContent = `${stats.bestCombos?.player ?? 0} / ${stats.bestCombos?.cpu ?? 0}`;
      }
    }

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
