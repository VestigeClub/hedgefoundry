// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { StatsPanel } from "./stats";
import { generateMap } from "../world/mapgen";
import { World } from "../sim/world";

function panel(): { el: HTMLElement; stats: StatsPanel; world: World } {
  const { map, feeds } = generateMap({ width: 64, height: 64, seed: 3, startClearRadius: 12, poolClusters: 6 });
  const world = new World({ map, feeds, seed: 3, startCapital: 500_000 });
  const el = document.createElement("div");
  document.body.appendChild(el);
  return { el, stats: new StatsPanel(el, world), world };
}

describe("StatsPanel", () => {
  it("toggle flips .open and renders the baseline rows", () => {
    const { el, stats } = panel();
    expect(stats.open).toBe(false);
    stats.toggle();
    expect(stats.open).toBe(true);
    expect(el.classList.contains("open")).toBe(true);
    expect(el.textContent).toContain("CAPITAL");
    stats.toggle();
    expect(stats.open).toBe(false);
    expect(el.classList.contains("open")).toBe(false);
  });

  it("update() samples the capital rate and patches rows on change", () => {
    const { el, stats, world } = panel();
    stats.toggle();
    stats.update(1000); // baseline sample
    stats.update(1100); // no change yet — same key
    expect(el.textContent).toContain("$500.0K");
    world.capital = 600_000;
    world.totals.alpha = 7;
    stats.update(1200); // new samples → key changed → re-render
    expect(el.textContent).toContain("$600.0K");
    expect(el.textContent).toContain("ALPHA");
    expect(el.textContent).toContain("7");
  });
});
