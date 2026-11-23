/**
 * Procedural Web Audio Foley for Hailstone Scrabble
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  tone(freq, dur = 0.09, vol = 0.11, type = 'triangle', slideTo = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  place() { this.tone(320, 0.055, 0.09, 'sine', 240); }
  recall() { this.tone(420, 0.05, 0.07, 'sine', 520); }
  bank() {
    this.tone(440, 0.1, 0.11);
    setTimeout(() => this.tone(554.37, 0.12, 0.11), 60);
  }
  spawn() {
    this.tone(293.66, 0.1, 0.11, 'triangle', 440);
    setTimeout(() => this.tone(587.33, 0.14, 0.12, 'triangle'), 70);
  }
  halve() {
    this.tone(587.33, 0.09, 0.12);
    setTimeout(() => this.tone(440, 0.11, 0.12), 65);
  }
  spike() {
    this.tone(330, 0.09, 0.12, 'sawtooth', 660);
    setTimeout(() => this.tone(660, 0.13, 0.12, 'triangle', 880), 60);
  }
  crush() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.24, 0.13, 'triangle'), i * 65);
    });
  }
}
