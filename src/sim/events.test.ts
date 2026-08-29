import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World } from "./world";
import { CRASH_AT_MS, RALLY_AT_MS, RAID_AT_MS } from "./events";

const DT = 33.3333;
const MAP_OPTS = { width: 128, height: 128, seed: 7, startClearRadius: 14, poolClusters: 25 };

function world(): World {
  const { map, feeds } = generateMap(MAP_OPTS);
  return new World({ map, feeds, seed: MAP_OPTS.seed, startCapital: 1_000_000 });
}

/** Advance the sim in 33 ms steps to `simMs`, exactly like a live run. */
function runTo(w: World, simMs: number): void {
  while (w.timeMs < simMs) tickWorld(w, DT);
}

function countTimeline(w: World, needle: string): number {
  return w.timeline.filter((t) => t.msg.includes(needle)).length;
}

describe("scripted market events", () => {
  it("fires the raid once at 6 sim-min with 5 extra bros", () => {
    const w = world();
    const before = [...w.entities.values()].filter((e) => e.kind === "bro").length;
    runTo(w, RAID_AT_MS + DT);
    expect(w.events.fired["short-raid"]).toBe(true);
    const after = [...w.entities.values()].filter((e) => e.kind === "bro").length;
    expect(after - before).toBeGreaterThanOrEqual(5); // metered wave may add more
    expect(countTimeline(w, "SHORT RAID")).toBe(1);
    runTo(w, RAID_AT_MS + 30_000);
    expect(countTimeline(w, "SHORT RAID")).toBe(1);
  });

  it("crash scales feed richness for the window then restores", () => {
    const w = world();
    runTo(w, CRASH_AT_MS + DT);
    expect(w.events.fired["flash-crash"]).toBe(true);
    expect(w.events.richnessMult).toBeCloseTo(0.7, 5);
    expect(countTimeline(w, "FLASH CRASH")).toBe(1);
    runTo(w, CRASH_AT_MS + 61_000);
    expect(w.events.richnessMult).toBe(1);
    expect(countTimeline(w, "FLASH CRASH")).toBe(1);
  });

  it("rally lifts fuel prices for the window then restores", () => {
    const w = world();
    runTo(w, RALLY_AT_MS + DT);
    expect(w.events.fired["rally"]).toBe(true);
    expect(w.events.fuelPriceMult).toBeCloseTo(1.25, 5);
    expect(countTimeline(w, "RALLY")).toBe(1);
    runTo(w, RALLY_AT_MS + 61_000);
    expect(w.events.fuelPriceMult).toBe(1);
    expect(countTimeline(w, "RALLY")).toBe(1);
  });
});
