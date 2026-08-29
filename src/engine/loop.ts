/**
 * Fixed-tick simulation loop with interpolated rendering.
 * Sim advances at `fixedHz` (default 30) regardless of frame rate; render is
 * called every rAF with the interpolation alpha. DESIGN.md §10.
 */
export interface LoopSink {
  tick(dtMs: number): void;
  render(alpha: number): void;
}

export class Loop {
  paused = false;
  /** Sim speed multiplier: 1×, 2×, 4×. */
  speed = 1;


  private readonly fixedMs: number;
  private raf = 0;
  private last = 0;
  private acc = 0;

  constructor(
    private readonly sink: LoopSink,
    fixedHz = 30,
  ) {
    this.fixedMs = 1000 / fixedHz;
  }

  start(): void {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    const dt = Math.min(now - this.last, 250); // clamp spiral-of-death
    this.last = now;
    if (!this.paused) {
      this.acc += dt * this.speed;
      const cap = this.fixedMs * 8; // drop behind rather than spiral
      if (this.acc > cap) this.acc = cap;
      while (this.acc >= this.fixedMs) {
        this.sink.tick(this.fixedMs);
        this.acc -= this.fixedMs;
      }
    }
    this.sink.render(this.acc / this.fixedMs);
    this.raf = requestAnimationFrame(this.frame);
  };
}

/** Chrome label for the speed chip (DESIGN.md §8): paused or the multiplier. */
export function speedChipLabel(paused: boolean, speed: number): string {
  return paused ? "PAUSED" : `${speed}×`;
}
