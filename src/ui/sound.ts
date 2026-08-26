/**
 * Sound design (DESIGN.md §8, M6) — WebAudio synth, zero assets.
 * Every sound is generated: square/triangle blips, filtered noise for
 * tower shots. Lazily creates the AudioContext on first user gesture.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Must be called from a user gesture at least once (autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null; // no audio available — stay silent
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol = 0.3, slideTo?: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  private noise(dur: number, vol = 0.2, freq = 800): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  place(): void {
    this.tone(220, 0.08, "square", 0.15, 330);
  }

  denied(): void {
    this.tone(140, 0.12, "square", 0.2, 90);
  }

  craft(item: "clean" | "signal" | "alpha" | "brief"): void {
    const freqs = { clean: 440, signal: 520, alpha: 660, brief: 380 } as const;
    this.tone(freqs[item], 0.06, "triangle", 0.12, freqs[item] * 1.5);
  }

  researchDone(): void {
    this.tone(523, 0.1, "triangle", 0.2);
    setTimeout(() => this.tone(784, 0.16, "triangle", 0.2), 90);
  }

  hire(): void {
    this.tone(660, 0.09, "square", 0.2, 880);
    this.tone(990, 0.14, "square", 0.2, 1320);
  }

  towerShot(): void {
    this.noise(0.09, 0.25, 1400);
    this.tone(160, 0.08, "square", 0.15, 90);
  }

  broSpawn(): void {
    this.tone(200, 0.25, "sawtooth", 0.12, 320);
  }

  warning(): void {
    this.tone(880, 0.1, "square", 0.16);
    setTimeout(() => this.tone(880, 0.1, "square", 0.16), 160);
  }

  win(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.25, "triangle", 0.25), i * 140));
  }

  lose(): void {
    const notes = [392, 330, 262, 196];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.3, "sawtooth", 0.2), i * 180));
  }
}
