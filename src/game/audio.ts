import { GAME_CONFIG } from './gameConfig';
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOptions {
  type?: OscillatorType;
  volume?: number;
  delay?: number;
  slideTo?: number;
}

export class Sfx {
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(GAME_CONFIG.muteKey) === '1';
    } catch {}
  }

  toggleMute(): void {
    this.muted = !this.muted;
    try {
      localStorage.setItem(GAME_CONFIG.muteKey, this.muted ? '1' : '0');
    } catch {}
  }

  click(): void {
    const pitch = 440 + Math.random() * 80;
    this.tone(pitch, 0.06, { type: 'triangle', volume: 0.07 });
    this.tone(110, 0.09, { type: 'sine', volume: 0.09 });
  }

  buy(): void {
    this.tone(660, 0.09, { type: 'triangle' });
    this.tone(880, 0.12, { type: 'triangle', delay: 0.08 });
  }

  deny(): void {
    this.tone(160, 0.14, { type: 'sawtooth', volume: 0.05, slideTo: 110 });
  }

  warning(): void {
    this.tone(880, 0.12, { type: 'square', volume: 0.04 });
    this.tone(880, 0.12, { type: 'square', volume: 0.04, delay: 0.2 });
  }

  rally(): void {
    this.tone(120, 0.5, { type: 'sawtooth', volume: 0.07, slideTo: 80 });
    this.tone(180, 0.5, { type: 'sawtooth', volume: 0.05, slideTo: 120 });
  }

  sanctions(): void {
    this.tone(420, 0.35, { type: 'sawtooth', volume: 0.05, slideTo: 200 });
  }

  success(): void {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', delay: i * 0.08 }));
  }

  buffAppear(): void {
    this.tone(1200, 0.16, { type: 'sine', volume: 0.06, slideTo: 1800 });
  }

  buffCollect(): void {
    [784, 988, 1175].forEach((f, i) => this.tone(f, 0.1, { type: 'sine', delay: i * 0.06 }));
  }

  lose(): void {
    [392, 311, 261, 196].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', delay: i * 0.22 }));
  }

  private tone(freq: number, duration: number, options: ToneOptions = {}): void {
    if (this.muted) return;
    const audio = getContext();
    if (!audio) return;

    const { type = 'sine', volume = 0.08, delay = 0, slideTo } = options;
    const start = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== undefined) osc.frequency.linearRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}
