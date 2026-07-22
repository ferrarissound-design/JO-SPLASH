// ============================================================================
// AudioManager — every sound effect is synthesized with the Web Audio API
// (no external audio assets). The AudioContext is created suspended and
// resumed on the first user gesture to respect browser autoplay policies.
// ============================================================================
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this._noiseBuffer = null;
    this._resumed = false;

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

  playShoot() {
    this._tone(620, 0.07, { type: 'triangle', peak: 0.18, freqEnd: 340 });
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

  playCountdownBeep() {
    this._tone(520, 0.12, { type: 'square', peak: 0.2 });
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
    this.ctx?.close();
  }
}
