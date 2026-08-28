import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World, VAULT_CAPACITY, type EntityKind } from "./world";
import { bufferAdd } from "./production";
import { TECHS, applyTech } from "./research";
import { FUEL_PRICE, FUNDING_FUELS, RECIPES } from "./recipes";

const DT = 33.3333;

/** updateMiner's tape/s at richness 1.0 (update.ts:98 — private there). */
const MINER_BASE_RATE = 4;

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

  it("re-asking for the current tech keeps banked points; changing it clears", () => {
    const w = makeWorld();
    w.setResearchTarget("tape-speed-1");
    w.researchPoints = 4;
    w.setResearchTarget("tape-speed-1"); // the panel routes every row click through here
    expect(w.researchPoints).toBe(4); // a check-in on the in-flight tech must not burn the run
    w.setResearchTarget(null); // opting out is a real change
    expect(w.researchPoints).toBe(0);
    w.setResearchTarget("tape-speed-1");
    w.researchPoints = 4;
    w.setResearchTarget("cleaner-speed-1");
    expect(w.researchPoints).toBe(0); // points belong to the tech that earned them
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
    const miner = w.placeEntity("miner", f.x, f.y)!;
    const vs = findSpot(w, "vault", f.x - 2, f.y, 2);
    w.placeEntity("vault", vs.x, vs.y);
    tickWorld(w, DT);
    expect(w.powered.has(miner.id)).toBe(true); // rig must be in range
    expect(w.multiplier).toBe(1); // no brownout: one miner bills 10/s (§5.4)
    // Drain the rig first: a jam zeroes rateAcc (update.ts:108-111), which would
    // hide the tech. Belts are pumped to 12 tiles/s because the default 1.5 frees
    // a tail slot only every BELT_SPACING/speed ≈ 5 ticks — that caps one intake
    // belt at ~3 tape/s, under this rig's 7.2 tape/s, and 24 tiles hold the 80
    // tape both measurement windows push through (5 items per tile).
    for (let i = 0; i < 24; i++) {
      const b = w.placeEntity("belt", miner.x, miner.y + miner.h + i);
      if (!b) break;
      b.belt!.dir = "S";
      b.belt!.speed = 12;
    }
    tickWorld(w, DT);
    const richness = w.feedAt(f.x, f.y)!.richness; // a 1.0–2.2 multiplier (mapgen.ts)
    // Ticks to pull `n` tape from a zeroed accumulator: updateMiner adds
    // MINER_BASE_RATE × richness × (1 + 0.25 × minerSpeed) × dt per tick, so it is
    // ceil(n ÷ that per-tick amount).
    const ticksFor = (n: number): number => {
      miner.miner!.rateAcc = 0;
      const start = w.totals.tape;
      let steps = 0;
      while (w.totals.tape - start < n && steps < 900) {
        tickWorld(w, DT);
        steps++;
      }
      expect(steps).toBeLessThan(900); // the lane never jammed
      return steps;
    };
    const predicted = (n: number, speedMult: number) =>
      Math.ceil(n / (MINER_BASE_RATE * richness * speedMult * (DT / 1000)));
    const plain = ticksFor(40);
    expect(plain).toBe(predicted(40, 1)); // 4 × 1.8 = 7.2 tape/s → 167 ticks
    applyTech(w, "miner-speed-1"); // "Miners +25%" → tech.minerSpeed 1 (research.ts:54)
    expect(w.tech.minerSpeed).toBe(1);
    const boosted = ticksFor(40);
    expect(boosted).toBe(predicted(40, 1 + 0.25)); // speedMult 1.25 → 134 ticks
    expect(boosted).toBeLessThan(plain); // the same harvest, strictly sooner
  });

  it("fuel tier switches funding to signals", () => {
    const w = makeWorld(7, 100_000);
    const f = w.feeds[0]!;
    const fs = findSpot(w, "funding", f.x + 10, f.y, 6);
    const funding = w.placeEntity("funding", fs.x, fs.y)!;
    const signal = FUNDING_FUELS.find((x) => x.fuel === "signal")!;
    // A desk burns one analytics line's output (recipes.ts: ratePerSec =
    // recipeRate(signal) = 1000/2000 = 0.5/s) at FUEL_PRICE.signal 900 → 450 CAP/s.
    expect(signal.ratePerSec).toBe(1000 / RECIPES.signal!.timeMs);
    expect(signal.capPerSec).toBe(FUEL_PRICE.signal * signal.ratePerSec);
    expect(signal.capPerSec).toBe(450);
    applyTech(w, "fuel-tier-1"); // unlocks the signal tier (recipes.ts FUEL_TIER 1)
    bufferAdd(funding.funding!.input, "signal", 8);
    const before = w.capital;
    tick(w, 4);
    expect(funding.funding!.selling).toBe("signal"); // switched off clean fuel
    // 4 s × 450 = 1800; the sim only ran 120 × 33.3333 ms = 3.999996 s of it.
    expect(w.capital - before).toBeCloseTo(4 * signal.capPerSec, 1);
    // The desk buffer is 24 slots (world.ts:323) and 0.5/s burns 2 units in 4 s.
    expect(funding.funding!.input.total).toBeCloseTo(8 - 4 * signal.ratePerSec, 2);
    // 8 units ÷ 0.5 per s = 16 s of tank, so by t = 18 s it is dry: the last
    // partial burn takes exactly what was left, so the buffer reads a hard 0.
    tick(w, 14);
    expect(funding.funding!.input.total).toBe(0);
    expect(w.capital - before).toBeCloseTo(16 * signal.capPerSec, 0); // 7200: 16 s of tank, no more
    const dry = w.capital;
    tick(w, 4);
    expect(w.capital).toBe(dry); // an unfed desk earns nothing
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
    expect(w.capitalCapacity()).toBe(base + VAULT_CAPACITY);
  });
});
