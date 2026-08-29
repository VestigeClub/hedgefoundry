import { HIRE_QUOTA, type World } from "../sim/world";
import { ITEM_LABEL } from "../sim/items";

const fmt = (v: number): string => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v.toFixed(0));

const CHIPS = ["tape", "clean", "signal", "alpha", "brief"] as const;

const CARD_HTML = `
<div class="hud-card wide">
  <div class="hud-row"><span class="hud-label">CAPITAL</span><span class="hud-net" data-f="net"></span></div>
  <div class="hud-big" data-f="cap"></div>
  <div class="hud-meter"><div class="hud-fill" data-f="capfill"></div></div>
  <div class="hud-sub" data-f="capmax"></div>
</div>
<div class="hud-card">
  <span class="hud-label">GRID</span>
  <div class="hud-big" data-f="pwr"></div>
  <div class="hud-meter"><div class="hud-fill" data-f="pwrfill"></div></div>
</div>
<div class="hud-card">
  <span class="hud-label">IMPACT</span>
  <div class="hud-big" data-f="imp"></div>
  <div class="hud-meter"><div class="hud-fill heat" data-f="impfill"></div></div>
</div>
<div class="hud-card">
  <span class="hud-label">EVOLUTION</span>
  <div class="hud-big" data-f="evo"></div>
  <div class="hud-meter"><div class="hud-fill" data-f="evofill"></div></div>
</div>
<div class="hud-card">
  <span class="hud-label">HIRES</span>
  <div class="hud-big" data-f="hire"></div>
  <div class="hud-meter"><div class="hud-fill" data-f="hirefill"></div></div>
</div>
<div class="hud-chips">
  ${CHIPS.map((it) => `<span class="hud-chip" data-f="chip:${it}"></span>`).join("")}
</div>
<div class="hud-wave" data-f="wavecard">
  <span class="hud-label">NEXT WAVE</span>
  <span class="hud-big" data-f="wave"></span>
  <span class="hud-dial" data-f="dial"></span>
</div>
`;

/**
 * Top-right stat cards — the trading desk. Built once; text, fills and dial
 * backgrounds are patched only on change, throttled to ~10 Hz. Net $/s is an
 * EMA over real wall-clock deltas between updates.
 */
export class Hud {
  private readonly fields = new Map<string, HTMLElement>();
  private readonly cache = new Map<string, string>();
  private lastAt = -1e9;
  private lastCapital = 0;
  private net = 0;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = CARD_HTML;
    for (const el of root.querySelectorAll<HTMLElement>("[data-f]")) {
      this.fields.set(el.dataset.f!, el);
    }
  }

  update(w: World): void {
    const now = performance.now();
    const dt = (now - this.lastAt) / 1000;
    if (dt < 0.1) return;
    if (this.lastAt > 0) {
      const inst = (w.capital - this.lastCapital) / Math.max(0.1, Math.min(2, dt));
      this.net = this.net * 0.8 + inst * 0.2;
    }
    this.lastAt = now;
    this.lastCapital = w.capital;

    this.text("cap", `$${fmt(w.capital)}`);
    this.text("capmax", `/ ${fmt(w.capitalCapacity())} capacity`);
    this.pct("capfill", w.capital / Math.max(1, w.capitalCapacity()));
    const net = this.net;
    this.text("net", `${net >= 0 ? "+" : "−"}$${fmt(Math.abs(net))}/s`);
    this.fields.get("net")!.className = `hud-net ${net >= 0.5 ? "up" : net < -0.5 ? "down" : ""}`;

    const pwr = Math.round(w.multiplier * 100);
    this.text("pwr", `${pwr}%`);
    this.pct("pwrfill", w.multiplier);

    const impact = Math.round(w.totalImpact());
    this.text("imp", String(impact));
    this.pct("impfill", Math.min(1, impact / 30));
    const heat = impact >= 20 ? " hot" : impact >= 8 ? " mid" : "";
    const impfill = this.fields.get("impfill")!;
    const impCls = `hud-fill heat${heat}`;
    if (this.cache.get("impcls") !== impCls) {
      this.cache.set("impcls", impCls);
      impfill.className = impCls;
    }

    this.text("evo", `${Math.round(w.evolution * 100)}%`);
    this.pct("evofill", w.evolution);

    this.text("hire", `${w.hired}/${HIRE_QUOTA}`);
    this.pct("hirefill", w.hired / HIRE_QUOTA);

    for (const it of CHIPS) {
      const key = `chip:${it}`;
      const n = w.totals[it];
      const label = `${ITEM_LABEL[it].split(" ")[0]} ${n}`;
      const el = this.fields.get(key)!;
      if (this.cache.get(key) !== label) {
        this.cache.set(key, label);
        el.textContent = label;
        el.classList.toggle("on", n > 0);
      }
    }

    const sec = Math.max(0, Math.ceil(w.broSpawnTimerMs / 1000));
    this.text("wave", `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);
    this.pct("dial", w.broSpawnTimerMs / 60_000);
    this.fields.get("wavecard")!.classList.toggle("warn", sec <= 5);
  }

  private text(key: string, v: string): void {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    this.fields.get(key)!.textContent = v;
  }

  private pct(key: string, frac: number): void {
    const p = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    if (key === "dial") {
      if (this.cache.get(key) !== p) {
        this.cache.set(key, p);
        (this.fields.get(key) as HTMLElement).style.background = `conic-gradient(var(--cyan) ${p}, #1c2c3d 0%)`;
      }
      return;
    }
    if (this.cache.get(key) !== p) {
      this.cache.set(key, p);
      (this.fields.get(key) as HTMLElement).style.width = p;
    }
  }
}
