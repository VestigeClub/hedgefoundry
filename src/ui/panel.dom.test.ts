// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Panel } from "./panel";
import { generateMap } from "../world/mapgen";
import { BRO_STATS, World } from "../sim/world";

function harness(): { panel: Panel; el: HTMLElement; world: World } {
  const { map, feeds } = generateMap({ width: 64, height: 64, seed: 5, startClearRadius: 12, poolClusters: 6 });
  const world = new World({ map, feeds, seed: 5, startCapital: 1_000_000 });
  const el = document.createElement("div");
  document.body.appendChild(el);
  return { panel: new Panel(el, world), el, world };
}

describe("inspector hiring", () => {
  it("renders a HIRE button that survives live updates and actually hires", () => {
    const { panel, el, world } = harness();
    const bro = world.spawnBro("analyst", 30, 30);
    expect(bro).not.toBeNull();
    panel.setSelection(bro);

    const btn = el.querySelector("[data-hire]");
    expect(btn).not.toBeNull();

    // Two live repaints must not replace the node under the cursor — that is
    // what used to swallow the click.
    panel.update();
    panel.update();
    expect(el.querySelector("[data-hire]")).toBe(btn);

    const before = world.capital;
    btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(world.hired).toBe(1);
    expect(world.hiresByType.analyst).toBe(1);
    expect(world.capital).toBe(before - BRO_STATS.analyst.comp);
    expect(world.entities.has(bro!.id)).toBe(false);
  });

  it("keeps markup identical between identical frames", () => {
    const { panel, el, world } = harness();
    const bro = world.spawnBro("trader", 30, 30)!;
    panel.setSelection(bro);
    const html = el.innerHTML;
    panel.update();
    expect(el.innerHTML).toBe(html);
  });
});
