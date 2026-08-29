import { BRO_STATS, HIRE_QUOTA, type BroType, type World } from "../sim/world";

/**
 * Live stats panel (toggle: I — S is camera-pan-down, DESIGN.md §8). Mirrors
 * the research panel's open/patch-on-change pattern: rows render only when
 * the world's status key changes; the net $/s figure is the mean of the last
 * ten capital deltas sampled at ~10 Hz while open.
 */
const ITEMS = ["tape", "clean", "signal", "alpha", "brief"] as const;
const NET_WINDOW = 10; // updates in the moving-average window
const UPDATE_MS = 100; // ~10 Hz sampling while open
const BROTYPES: readonly BroType[] = ["analyst", "trader", "md", "quant"];

export class StatsPanel {
  open = false;
  private last = "";
  private lastCapital = 0;
  private lastAt = 0;
  private deltas: number[] = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly world: World,
  ) {}

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle("open", this.open);
    if (this.open) {
      this.last = "";
      this.lastAt = 0; // first update() re-baselines, never mid-flight
      this.deltas = [];
      this.render();
    }
  }

  /** Sample the capital rate at ~10 Hz; re-render when the status key moves. */
  update(nowMs: number = performance.now()): void {
    if (!this.open) return;
    if (this.lastAt === 0) {
      this.lastCapital = this.world.capital;
      this.lastAt = nowMs;
      return;
    }
    const dt = nowMs - this.lastAt;
    if (dt < UPDATE_MS) return;
    this.lastAt = nowMs;
    this.deltas.push((this.world.capital - this.lastCapital) / (dt / 1000));
    this.lastCapital = this.world.capital;
    if (this.deltas.length > NET_WINDOW) this.deltas.shift();
    const key = this.statusKey();
    if (key !== this.last) {
      this.last = key;
      this.render();
    }
  }

  private statusKey(): string {
    const w = this.world;
    return `${w.capital}:${w.totals.tape}:${w.totals.clean}:${w.totals.signal}:${w.totals.alpha}:${w.totals.brief}:${w.writtenOff.alpha}:${w.writtenOff.brief}:${w.hired}:${w.waves}:${w.brosKilled}:${w.totalImpact().toFixed(1)}:${w.capHistory.length}`;
  }

  private render(): void {
    const w = this.world;
    const net = this.deltas.length ? this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length : 0;
    const item = (k: (typeof ITEMS)[number]): string =>
      `<span class="stat-k">${k.toUpperCase()}</span><span class="stat-v">${w.totals[k]} <span class="stat-sub">(${w.writtenOff[k]} void)</span></span>`;
    const hire = (t: BroType): string =>
      `<span class="stat-k">${t.toUpperCase()}</span><span class="stat-v">${w.hiresByType[t]} × $${BRO_STATS[t].comp / 1000}k</span>`;
    this.el.innerHTML = `
      <div class="r-title">FUND STATS <span class="r-hint">[I]</span></div>
      <div class="stat-grid">
        <span class="stat-k">CAPITAL</span><span class="stat-v">$${fmtUsd(w.capital)}</span>
        <span class="stat-k">NET</span><span class="stat-v ${net >= 0 ? "up" : "down"}">${net >= 0 ? "+" : "−"}$${fmtUsd(Math.abs(net))}/s</span>
        ${ITEMS.map(item).join("")}
        ${BROTYPES.map(hire).join("")}
        <span class="stat-k">WAVES</span><span class="stat-v">${w.waves}</span>
        <span class="stat-k">BROS KILLED</span><span class="stat-v">${w.brosKilled}</span>
        <span class="stat-k">IMPACT</span><span class="stat-v">${w.totalImpact().toFixed(1)}</span>
        <span class="stat-k">QUOTA</span><span class="stat-v">${w.hired}/${HIRE_QUOTA}</span>
      </div>
      <canvas class="stat-curve" width="256" height="48"></canvas>`;
    const curve = this.el.querySelector<HTMLCanvasElement>(".stat-curve");
    if (curve) drawCapitalCurve(curve, w);
  }
}

function fmtUsd(v: number): string {
  return v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(2)}M`
    : v >= 1_000
      ? `${(v / 1_000).toFixed(1)}K`
      : String(Math.round(v));
}

/** Capital arc over the run, scaled to the observed range. */
function drawCapitalCurve(canvas: HTMLCanvasElement, w: World): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const h = w.capHistory;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (h.length < 2) return;
  let min = Infinity;
  let max = -Infinity;
  for (const p of h) {
    if (p.capital < min) min = p.capital;
    if (p.capital > max) max = p.capital;
  }
  const span = max - min || 1;
  ctx.strokeStyle = "#00e68c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < h.length; i++) {
    const x = (i / (h.length - 1)) * (canvas.width - 2) + 1;
    const y = canvas.height - 2 - ((h[i]!.capital - min) / span) * (canvas.height - 4);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
