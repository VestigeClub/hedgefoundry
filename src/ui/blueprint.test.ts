import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { COSTS, World } from "../sim/world";
import { copyBlueprint, stampBlueprint } from "./blueprint";

const MAP_OPTS = { width: 128, height: 128, seed: 7, startClearRadius: 14, poolClusters: 25 };

function world(): World {
  const { map, feeds } = generateMap(MAP_OPTS);
  const w = new World({ map, feeds, seed: MAP_OPTS.seed, startCapital: 1_000_000 });
  w.spawnHQ();
  return w;
}

describe("blueprint copy/paste", () => {
  it("copies a miner+belt rig and stamps it atomically", () => {
    const w = world();
    const f = w.feeds[0]!;
    w.placeEntity("miner", f.x, f.y);
    w.placeEntity("belt", f.x + 4, f.y);
    const belt = [...w.entities.values()].find((e) => e.kind === "belt")!;
    belt.belt!.dir = "E";

    const snap = copyBlueprint(w, f.x - 1, f.y - 1, f.x + 6, f.y + 1);
    expect(snap).not.toBeNull();
    expect(snap!.entries).toHaveLength(2);
    expect(snap!.entries.some((e) => e.kind === "belt" && e.dir === "E")).toBe(true);

    const capBefore = w.capital;
    const countBefore = w.entities.size;
    const expected = COSTS.miner + COSTS.belt;
    // Same patch, one tile clear of the original rig.
    const r = stampBlueprint(w, snap!, f.x + 1, f.y + 1, (k) => COSTS[k]);
    expect(r.placed).toBe(2);
    expect(r.cost).toBe(expected);
    expect(w.capital).toBe(capBefore - expected);
    expect(w.entities.size).toBe(countBefore + 2);
    const stamped = [...w.entities.values()].filter((e) => e.kind === "belt").find((e) => e.y !== f.y);
    expect(stamped!.belt!.dir).toBe("E"); // direction survives the copy
  });

  it("refuses to stamp onto occupied tiles (atomic refusal)", () => {
    const w = world();
    const f = w.feeds[0]!;
    w.placeEntity("miner", f.x, f.y);
    const snap = copyBlueprint(w, f.x, f.y, f.x + 1, f.y + 1);
    expect(snap).not.toBeNull();
    const capBefore = w.capital;
    const countBefore = w.entities.size;
    const r = stampBlueprint(w, snap!, f.x, f.y, (k) => COSTS[k]); // onto itself
    expect(r.placed).toBe(0);
    expect(r.blocked).toBeGreaterThan(0);
    expect(w.capital).toBe(capBefore); // nothing charged on refusal
    expect(w.entities.size).toBe(countBefore); // nothing placed either
  });
});
