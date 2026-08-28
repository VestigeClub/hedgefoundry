/**
 * Transient visual effects: pooled particles, floating numbers, expanding
 * rings, screen trauma. All positions are WORLD PIXELS; drawn after the
 * entities every frame. The sim never draws — it pushes FxCues onto
 * World.fx and main.ts drains them here. Fixed-size pools with free lists:
 * steady-state play allocates nothing.
 */

const MAX_PARTICLES = 384;
const MAX_FLOATS = 48;
const MAX_RINGS = 32;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  size: number;
  color: string;
  drag: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  ttl: number;
}

interface Ring {
  x: number;
  y: number;
  r1: number;
  age: number;
  ttl: number;
  color: string;
  width: number;
}

interface CameraLike {
  x: number;
  y: number;
  zoom: number;
}

/** Ease-out velocity + drag, upward bias; everything dies on its ttl. */
export class Fx {
  private readonly parts: Particle[] = [];
  private readonly floats: FloatText[] = [];
  private readonly rings: Ring[] = [];
  private readonly freeParts: Particle[] = [];
  private readonly freeFloats: FloatText[] = [];
  private readonly freeRings: Ring[] = [];

  /** Camera trauma (0..1); the shake decays, intensity is squared. */
  trauma = 0;
  /** Screen-space shake offset, applied by the renderer before world draws. */
  shakeX = 0;
  shakeY = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, ttl: 0, size: 0, color: "", drag: 0 });
      this.freeParts.push(this.parts[i]!);
    }
    for (let i = 0; i < MAX_FLOATS; i++) {
      this.floats.push({ x: 0, y: 0, text: "", color: "", age: 0, ttl: 0 });
      this.freeFloats.push(this.floats[i]!);
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      this.rings.push({ x: 0, y: 0, r1: 0, age: 0, ttl: 0, color: "", width: 0 });
      this.freeRings.push(this.rings[i]!);
    }
  }

  /** n sparks radiating outward from (wx, wy); angle spread, random speed. */
  burst(wx: number, wy: number, color: string, n: number, speed = 90, ttl = 550, size = 3): void {
    for (let i = 0; i < n; i++) {
      const p = this.freeParts.pop();
      if (!p) return; // pool exhausted — newer sparks drop, never queue
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      p.x = wx;
      p.y = wy;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v - speed * 0.35;
      p.age = 0;
      p.ttl = ttl * (0.7 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.color = color;
      p.drag = 2.6;
    }
  }

  /** A short-lived ring expanding from r=0 to r1 world px. */
  ring(wx: number, wy: number, color: string, r1: number, ttl = 500, width = 2): void {
    const r = this.freeRings.pop();
    if (!r) return;
    r.x = wx;
    r.y = wy;
    r.r1 = r1;
    r.age = 0;
    r.ttl = ttl;
    r.color = color;
    r.width = width;
  }

  /** Rising number/label; the classic "+$250" over a desk or hired bro. */
  floatText(text: string, color: string, wx: number, wy: number, ttl = 900): void {
    const f = this.freeFloats.pop();
    if (!f) return;
    f.x = wx;
    f.y = wy;
    f.text = text;
    f.color = color;
    f.age = 0;
    f.ttl = ttl;
  }

  /** Add camera trauma (0..1); the shake decays, intensity is squared. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  activeCount(): number {
    let n = 0;
    for (const p of this.parts) if (p.age < p.ttl) n++;
    for (const f of this.floats) if (f.age < f.ttl) n++;
    for (const r of this.rings) if (r.age < r.ttl) n++;
    return n;
  }

  /** Advance in wall-clock ms; recycles expired entries into the free lists. */
  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const p of this.parts) {
      if (p.age >= p.ttl) continue;
      p.age += dtMs;
      if (p.age >= p.ttl) {
        this.freeParts.push(p);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + 60 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const f of this.floats) {
      if (f.age >= f.ttl) continue;
      f.age += dtMs;
      if (f.age >= f.ttl) this.freeFloats.push(f);
      else f.y -= 34 * dt;
    }
    for (const r of this.rings) {
      if (r.age >= r.ttl) continue;
      r.age += dtMs;
      if (r.age >= r.ttl) this.freeRings.push(r);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const mag = this.trauma * this.trauma * 14;
    this.shakeX = mag === 0 ? 0 : (Math.random() * 2 - 1) * mag;
    this.shakeY = mag === 0 ? 0 : (Math.random() * 2 - 1) * mag;
  }

  /** Draw last (on top of entities), in world space through the camera. */
  draw(ctx: CanvasRenderingContext2D, cam: CameraLike): void {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const r of this.rings) {
      if (r.age >= r.ttl) continue;
      const k = r.age / r.ttl;
      const rad = r.r1 * k;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.width * cam.zoom * (1 - k * 0.5));
      ctx.beginPath();
      ctx.arc((r.x - cam.x) * cam.zoom, (r.y - cam.y) * cam.zoom, rad * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.parts) {
      if (p.age >= p.ttl) continue;
      ctx.globalAlpha = 1 - p.age / p.ttl;
      ctx.fillStyle = p.color;
      const s = Math.max(1, p.size * cam.zoom);
      ctx.fillRect((p.x - cam.x) * cam.zoom - s / 2, (p.y - cam.y) * cam.zoom - s / 2, s, s);
    }
    const fontPx = Math.max(10, Math.min(14, 13 * cam.zoom));
    ctx.font = `${fontPx}px ui-monospace, monospace`;
    for (const f of this.floats) {
      if (f.age >= f.ttl) continue;
      const k = f.age / f.ttl;
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - k; // quick fade in, long fade out
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, (f.x - cam.x) * cam.zoom, (f.y - cam.y) * cam.zoom - fontPx);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Reset for NEW GAME: recycle every pool, settle the shake. */
  clear(): void {
    for (const p of this.parts) {
      p.age = p.ttl;
      this.freeParts.push(p);
    }
    for (const f of this.floats) {
      f.age = f.ttl;
      this.freeFloats.push(f);
    }
    for (const r of this.rings) {
      r.age = r.ttl;
      this.freeRings.push(r);
    }
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }
}
