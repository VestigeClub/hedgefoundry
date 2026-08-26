import { HIRE_QUOTA, type World } from "../sim/world";
import { ITEM_LABEL } from "../sim/items";

const fmt = (v: number): string => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v.toFixed(0));

/** Top-right stats strip — updated at ~10 Hz; DOM text set only on change. */
export class Hud {
  private last = "";

  constructor(private readonly el: HTMLElement) {}

  update(w: World): void {
    const cap = `${fmt(w.capital)}/${fmt(w.capitalCapacity())}`;
    const burn = w.demandPerSec.toFixed(0);
    const mult = `${Math.round(w.multiplier * 100)}%`;
    const impact = Math.round(w.totalImpact());
    const evo = `${Math.round(w.evolution * 100)}%`;
    const totals = (["tape", "clean", "signal", "alpha", "brief"] as const)
      .map((it) => `${ITEM_LABEL[it].split(" ")[0]}:${w.totals[it]}`)
      .join(" ");
    const out = `CAP ${cap} · BURN ${burn}/s · PWR ${mult} · IMP ${impact} · EVO ${evo} · BROS ${w.hired}/${HIRE_QUOTA} · ${totals}`;
    if (out !== this.last) {
      this.el.textContent = out;
      this.last = out;
    }
  }
}
