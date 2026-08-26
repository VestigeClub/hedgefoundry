import type { MarketFrame } from "../market/types";

const fmtPrice = (v: number): string =>
  v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toFixed(4);

/**
 * Top ticker tape: one entry per coin, updated from ctx frames.
 * Quant-terminal styling via CSS classes; DOM text is only touched on change.
 */
export class Ticker {
  private readonly coins = new Map<string, TickerEntry>();

  constructor(
    private readonly root: HTMLElement,
    private readonly chip: HTMLElement,
  ) {}

  onFrame(f: MarketFrame): void {
    if (f.ch !== "ctx") return;
    let c = this.coins.get(f.coin);
    if (!c) {
      c = this.addCoin(f.coin);
      c.last = f.mark;
    }
    const dir: 1 | -1 | 0 = f.mark > c.last ? 1 : f.mark < c.last ? -1 : c.dir;
    c.dir = dir;
    c.last = f.mark;
    c.px.textContent = fmtPrice(f.mark);
    c.arrow.textContent = dir > 0 ? "▲" : dir < 0 ? "▼" : "•";
    c.arrow.className = `arrow ${dir > 0 ? "up" : dir < 0 ? "down" : "flat"}`;
    c.fnd.textContent = `f ${(f.funding_hourly * 100).toFixed(3)}%`;
  }

  setStatus(s: "live" | "sim" | "connecting"): void {
    this.chip.textContent = s.toUpperCase();
    this.chip.className = `chip ${s}`;
  }

  private addCoin(coin: string): TickerEntry {
    const el = document.createElement("span");
    el.className = "tick-coin";
    el.innerHTML = `<b></b><span class="px">—</span><span class="arrow flat">•</span><span class="fnd"></span>`;
    el.querySelector("b")!.textContent = coin;
    this.root.appendChild(el);
    const entry: TickerEntry = {
      el,
      px: el.querySelector(".px") as HTMLElement,
      arrow: el.querySelector(".arrow") as HTMLElement,
      fnd: el.querySelector(".fnd") as HTMLElement,
      last: 0,
      dir: 0 as 1 | -1 | 0,
    };
    this.coins.set(coin, entry);
    return entry;
  }
}
interface TickerEntry {
  el: HTMLElement;
  px: HTMLElement;
  arrow: HTMLElement;
  fnd: HTMLElement;
  last: number;
  dir: 1 | -1 | 0;
}
