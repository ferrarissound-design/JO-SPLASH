const BGM_URL = new URL('./turf_war_anthem.mp3', import.meta.url).href;

// ============================================================================
// AudioManager — every sound effect is synthesized with the Web Audio API
// (no external audio assets). The AudioContext is created suspended and
// resumed on the first user gesture to respect browser autoplay policies.
// The battle BGM is the one exception: a real audio file played back via
// HTMLAudioElement, looped for the duration of a match.
// ============================================================================
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this._noiseBuffer = null;
    this._resumed = false;
    this._surfLoop = null;

    this.bgm = new Audio(BGM_URL);
    this.bgm.loop = true;
    this.bgm.volume = 0.35;
    this.bgm.preload = 'auto';

    this._pendingResume = () => this.resume();
    window.addEventListener('pointerdown', this._pendingResume);
    window.addEventListener('keydown', this._pendingResume);
  }

  resume() {
    if (this._resumed) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.55;
    this.masterGain.connect(this.ctx.destination);
    this._noiseBuffer = this._buildNoiseBuffer();
    this._resumed = true;
    window.removeEventListener('pointerdown', this._pendingResume);
    window.removeEventListener('keydown', this._pendingResume);
  }

  _buildNoiseBuffer() {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * 0.5, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _tone(freq, duration, { type = 'sine', peak = 0.3, freqEnd = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noise(duration, { peak = 0.3, filterFreq = 1200, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(gain).connect(this.masterGain);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  startInkSurfLoop() {
    if (!this.ctx || this._surfLoop) return;

    const t0 = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, t0);
    filter.frequency.linearRampToValueAtTime(760, t0 + 0.18);
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.12);

    noise.connect(filter).connect(gain).connect(this.masterGain);
    noise.start(t0);
    this._surfLoop = { noise, gain };
  }

  stopInkSurfLoop() {
    if (!this.ctx || !this._surfLoop) return;
    const { noise, gain } = this._surfLoop;
    const t0 = this.ctx.currentTime;
    if (typeof gain.gain.cancelAndHoldAtTime === 'function') {
      gain.gain.cancelAndHoldAtTime(t0);
    } else {
      gain.gain.cancelScheduledValues(t0);
      gain.gain.setValueAtTime(0.08, t0);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    noise.stop(t0 + 0.16);
    this._surfLoop = null;
  }

  playBattleBGM() {
    this.bgm.currentTime = 0;
    this.bgm.playbackRate = 1;
    this.bgm.volume = 0.35;
    this.bgm.play().catch(() => {});
  }

  setBattleFinale(active) {
    this.bgm.playbackRate = active ? 1.08 : 1;
    this.bgm.volume = active ? 0.43 : 0.35;
  }

  stopBattleBGM() {
    this.bgm.pause();
    this.bgm.currentTime = 0;
    this.bgm.playbackRate = 1;
    this.bgm.volume = 0.35;
  }

  playInkSurfExit() {
    this._tone(260, 0.12, { type: 'triangle', peak: 0.13, freqEnd: 520 });
    this._noise(0.16, { peak: 0.11, filterFreq: 1500 });
  }

  playInkRoll() {
    this._tone(210, 0.24, { type: 'sawtooth', peak: 0.18, freqEnd: 720 });
    this._tone(640, 0.16, { type: 'triangle', peak: 0.14, freqEnd: 980, delay: 0.05 });
    this._noise(0.28, { peak: 0.16, filterFreq: 2100 });
  }

  playShoot() {
    this._tone(620, 0.07, { type: 'triangle', peak: 0.18, freqEnd: 340 });
  }

  playChargeStart() {
    this._tone(240, 0.12, { type: 'triangle', peak: 0.08, freqEnd: 420 });
  }

  playChargeReady() {
    this._tone(680, 0.16, { type: 'sine', peak: 0.15, freqEnd: 1120 });
    this._tone(1020, 0.12, { type: 'triangle', peak: 0.1, freqEnd: 1380, delay: 0.04 });
  }

  playChargeShot(chargeRatio = 0) {
    const ratio = Math.max(0, Math.min(1, chargeRatio));
    this._tone(520 + ratio * 280, 0.11 + ratio * 0.08, {
      type: 'sawtooth',
      peak: 0.16 + ratio * 0.1,
      freqEnd: 180 + ratio * 90,
    });
    this._noise(0.08 + ratio * 0.12, {
      peak: 0.1 + ratio * 0.12,
      filterFreq: 1200 + ratio * 1400,
    });
  }

  playImpact() {
    this._noise(0.12, { peak: 0.16, filterFreq: 900 });
  }

  playDamage() {
    this._tone(180, 0.15, { type: 'sawtooth', peak: 0.22, freqEnd: 90 });
    this._noise(0.1, { peak: 0.12, filterFreq: 600 });
  }

  playKO() {
    this._tone(220, 0.35, { type: 'sawtooth', peak: 0.28, freqEnd: 55 });
    this._noise(0.4, { peak: 0.25, filterFreq: 1400 });
  }

  playSpecial() {
    this._tone(180, 0.5, { type: 'sawtooth', peak: 0.2, freqEnd: 760 });
    this._tone(360, 0.35, { type: 'triangle', peak: 0.16, freqEnd: 1100, delay: 0.08 });
    this._noise(0.55, { peak: 0.2, filterFreq: 1800 });
  }

  playBombThrow() {
    this._tone(310, 0.16, { type: 'triangle', peak: 0.15, freqEnd: 150 });
    this._noise(0.09, { peak: 0.1, filterFreq: 1100 });
  }

  playCountdownBeep() {
    this._tone(520, 0.12, { type: 'square', peak: 0.2 });
  }

  playFinalCountdown(second, totalSeconds = 10) {
    const urgencySpan = Math.max(1, totalSeconds - 1);
    const urgency = Math.max(0, Math.min(1, (totalSeconds - second) / urgencySpan));
    const frequency = 560 + urgency * 320;
    this._tone(frequency, second <= 3 ? 0.16 : 0.1, {
      type: 'square',
      peak: second <= 3 ? 0.24 : 0.16,
      freqEnd: frequency * (second <= 3 ? 1.18 : 1),
    });
    if (second === totalSeconds) this._noise(0.32, { peak: 0.14, filterFreq: 1900 });
  }

  playTimeUp() {
    this._tone(880, 0.2, { type: 'square', peak: 0.24, freqEnd: 440 });
    this._tone(440, 0.34, { type: 'sawtooth', peak: 0.2, freqEnd: 110, delay: 0.17 });
    this._noise(0.42, { peak: 0.2, filterFreq: 1300 });
  }

  playStart() {
    this._tone(440, 0.25, { type: 'square', peak: 0.22, freqEnd: 880 });
  }

  playWin() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.28, { type: 'triangle', peak: 0.22, delay: i * 0.11 }));
  }

  playLose() {
    [392, 349, 294, 220].forEach((f, i) => this._tone(f, 0.32, { type: 'sawtooth', peak: 0.2, delay: i * 0.13 }));
  }

  dispose() {
    window.removeEventListener('pointerdown', this._pendingResume);
    window.removeEventListener('keydown', this._pendingResume);
    this.stopInkSurfLoop();
    this.stopBattleBGM();
    this.ctx?.close();
  }
}
