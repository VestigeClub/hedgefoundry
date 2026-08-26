import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World, type EntityKind } from "./world";
import { bufferAdd } from "./production";
import { TECHS, applyTech } from "./research";

const DT = 33.3333;

function makeWorld(seed = 7, startCapital?: number): World {
  const { map, feeds } = generateMap({ width: 128, height: 128, seed, startClearRadius: 14, poolClusters: 25 });
  return new World({ map, feeds, seed, startCapital });
}

function findSpot(w: World, kind: EntityKind, sx: number, sy: number, win = 14): { x: number; y: number } {
  for (let y = sy - win; y <= sy + win; y++) {
    for (let x = sx - win; x <= sx + win; x++) {
      if (w.canPlace(kind, x, y) === null) return { x, y };
    }
  }
  throw new Error(`no spot for ${kind} near ${sx},${sy}`);
}

function tick(w: World, seconds: number): void {
  const steps = Math.round((seconds * 1000) / DT);
  for (let i = 0; i < steps; i++) tickWorld(w, DT);
}

describe("research tree", () => {
  it("techs have unique ids and sane costs", () => {
    const ids = new Set(TECHS.map((t) => t.id));
    expect(ids.size).toBe(TECHS.length);
    for (const t of TECHS) {
      expect(t.cost).toBeGreaterThan(0);
      if (t.requires) {
        for (const r of t.requires) expect(ids.has(r)).toBe(true);
      }
    }
  });

  it("research desk applies a tech after cost crafts (points accumulate)", () => {
    const w = makeWorld();
    const spot = findSpot(w, "research", 50, 50, 3);
    w.placeEntity("vault", spot.x - 3, spot.y - 3);
    const desk = w.placeEntity("research", spot.x, spot.y)!;
    bufferAdd(desk.machine!.crafter.input, "alpha", 6);
    bufferAdd(desk.machine!.crafter.input, "signal", 6);
    w.setResearchTarget("tape-speed-1"); // cost 5
    tick(w, 60); // 5 crafts × 10s
    expect(w.researched.has("tape-speed-1")).toBe(true);
    expect(w.tech.tapeSpeed).toBe(1);
    expect(w.researchTarget).toBeNull();
    expect(desk.machine!.crafter.input.total).toBe(2); // 12 fed, 10 consumed
  });

  it("desk idles (consumes nothing) without a target", () => {
    const w = makeWorld();
    const spot = findSpot(w, "research", 50, 50, 3);
    w.placeEntity("vault", spot.x - 3, spot.y - 3);
    const desk = w.placeEntity("research", spot.x, spot.y)!;
    bufferAdd(desk.machine!.crafter.input, "alpha", 4);
    bufferAdd(desk.machine!.crafter.input, "signal", 4);
    tick(w, 30);
    expect(desk.machine!.crafter.input.total).toBe(8);
    expect(w.researched.size).toBe(0);
  });

  it("miner speed tech accelerates extraction", () => {
    const w = makeWorld();
    const f = w.feeds[0]!;
    w.placeEntity("miner", f.x, f.y);
    const fs = findSpot(w, "funding", f.x + 10, f.y, 6);
    w.placeEntity("funding", fs.x, fs.y);
    const vs = findSpot(w, "vault", f.x + 14, f.y, 6);
    w.placeEntity("vault", vs.x, vs.y);
    tickWorld(w, DT);
    const miner = [...w.entities.values()].find((e) => e.kind === "miner")!;
    expect(w.powered.has(miner.id)).toBe(true); // rig must be in range
    // drain belt so the 4-slot output buffer never saturates
    for (let i = 0; i < 4; i++) w.placeEntity("belt", miner.x + miner.w + i, miner.y);
    tick(w, 5);
    const before = w.totals.tape;
    applyTech(w, "miner-speed-1");
    tick(w, 5);
    const after = w.totals.tape;
    expect(after - before).toBeGreaterThan(before + 1); // strictly faster after +25%
  });

  it("fuel tier switches funding to signals", () => {
    const w = makeWorld(7, 100_000);
    const f = w.feeds[0]!;
    const fs = findSpot(w, "funding", f.x + 10, f.y, 6);
    const funding = w.placeEntity("funding", fs.x, fs.y)!;
    applyTech(w, "fuel-tier-1");
    bufferAdd(funding.funding!.input, "signal", 8);
    const before = w.capital;
    tick(w, 4);
    // T1: 160 CAP/s, but the 8-slot buffer holds only 2s of fuel (4/s).
    const delta = w.capital - before;
    expect(delta).toBeGreaterThan(280); // ≈ 320 (2s × 160)
    expect(delta).toBeLessThan(350);
    expect(funding.funding!.input.total).toBe(0);
  });

  it("tape speed tech accelerates belts", () => {
    const w = makeWorld();
    const f = w.feeds[0]!;
    const b1 = w.placeEntity("belt", 10, 10)!;
    const b2 = w.placeEntity("belt", 11, 10)!;
    b1.belt!.items.push({ item: "tape", pos: 0.8 });
    applyTech(w, "tape-speed-1");
    tick(w, 0.3);
    expect(b2.belt!.items.length).toBe(1);
  });

  it("vault capacity tech raises the reserve cap", () => {
    const w = makeWorld();
    const base = w.capitalCapacity();
    applyTech(w, "vault-cap-1");
    expect(w.capitalCapacity()).toBe(base + 50_000);
  });
});
