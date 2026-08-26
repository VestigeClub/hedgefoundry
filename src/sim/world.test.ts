import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World, BASE_CAPITAL_CAP, VAULT_CAPACITY, type EntityKind } from "./world";
import { bufferAdd } from "./production";

const DT = 33.3333;

function makeWorld(seed = 7, startCapital?: number): World {
  const { map, feeds } = generateMap({ width: 128, height: 128, seed, startClearRadius: 14, poolClusters: 25 });
  return new World({ map, feeds, seed, startCapital });
}

/** Deterministic spot finder: first tile in a window where placement is legal. */
function findSpot(w: World, kind: EntityKind, sx: number, sy: number, win = 14): { x: number; y: number } {
  for (let y = sy - win; y <= sy + win; y++) {
    for (let x = sx - win; x <= sx + win; x++) {
      if (w.canPlace(kind, x, y) === null) return { x, y };
    }
  }
  throw new Error(`no spot for ${kind} near ${sx},${sy}`);
}

/** Standard powered mining rig: miner on a feed + funding + vault. */
function rig(w: World): number {
  const f = w.feeds[0]!;
  const m = w.placeEntity("miner", f.x, f.y)!;
  const funding = findSpot(w, "funding", f.x + 10, f.y, 6);
  w.placeEntity("funding", funding.x, funding.y);
  const vault = findSpot(w, "vault", f.x + 14, f.y, 6);
  w.placeEntity("vault", vault.x, vault.y);
  return m.id;
}

/** Place a vault within ~2 tiles of (sx, sy) so nearby machines are powered. */
function powerNear(w: World, sx: number, sy: number): void {
  const v = findSpot(w, "vault", sx, sy, 2);
  w.placeEntity("vault", v.x, v.y);
}

function tick(w: World, seconds: number): void {
  const steps = Math.round((seconds * 1000) / DT);
  for (let i = 0; i < steps; i++) tickWorld(w, DT);
}

describe("World placement", () => {
  it("rejects out of bounds, occupied, and off-feed placements", () => {
    const w = makeWorld();
    expect(w.canPlace("miner", -1, 0)).toBe("OUT OF BOUNDS");
    const spot = findSpot(w, "cleaner", 30, 30);
    w.placeEntity("cleaner", spot.x, spot.y);
    expect(w.canPlace("cleaner", spot.x, spot.y)).toBe("OCCUPIED");
    // miner on floor (no feed)
    const floor = findSpot(w, "cleaner", 60, 60);
    expect(w.canPlace("miner", floor.x, floor.y)).toBe("NEEDS DATA FEED");
    // machines cannot sit on feed tiles; belts can
    const f = w.feeds[0]!;
    expect(w.canPlace("cleaner", f.x, f.y)).toBe("BLOCKED BY DATA FEED");
    expect(w.canPlace("belt", f.x, f.y)).toBeNull();
  });

  it("deducts costs and blocks on insufficient capital", () => {
    const rich = makeWorld(7);
    const spot = findSpot(rich, "cleaner", 30, 30);
    const poor = makeWorld(7, 1_000);
    expect(poor.canPlace("cleaner", spot.x, spot.y)).toBe("INSUFFICIENT CAPITAL");
    expect(poor.placeEntity("cleaner", spot.x, spot.y)).toBeNull();
  });

  it("vaults raise the capital cap", () => {
    const w = makeWorld();
    expect(w.capitalCapacity()).toBe(BASE_CAPITAL_CAP);
    const spot = findSpot(w, "vault", 30, 30);
    w.placeEntity("vault", spot.x, spot.y);
    expect(w.capitalCapacity()).toBe(BASE_CAPITAL_CAP + VAULT_CAPACITY);
  });
});

describe("mining + belts", () => {
  it("miner on a feed produces tape and pushes it to an adjacent belt", () => {
    const w = makeWorld();
    const minerId = rig(w);
    const miner = w.entities.get(minerId)!;
    const f = w.feeds[0]!;
    w.placeEntity("belt", miner.x + miner.w, f.y);
    tick(w, 5);
    const belt = w.entityAt(miner.x + miner.w, f.y)!;
    expect(w.totals.tape).toBeGreaterThanOrEqual(4);
    expect(belt.belt!.items.length).toBeGreaterThan(0);
    expect(belt.belt!.items.every((it) => it.pos > 0.001)).toBe(true);
    expect(miner.miner!.output.total).toBeLessThanOrEqual(4); // overflow waits in buffer
  });

  it("items travel along a belt chain", () => {
    const w = makeWorld();
    const minerId = rig(w);
    const miner = w.entities.get(minerId)!;
    const f = w.feeds[0]!;
    const b1 = w.placeEntity("belt", miner.x + miner.w, f.y)!;
    const b2 = w.placeEntity("belt", miner.x + miner.w + 1, f.y)!;
    tick(w, 6);
    expect(b2.belt!.items.length).toBeGreaterThan(0); // reached the second belt
    void b1;
  });

  it("miner pushes to a west belt (side-adjacency fix)", () => {
    const w = makeWorld();
    const minerId = rig(w);
    const miner = w.entities.get(minerId)!;
    const f = w.feeds[0]!;
    const belt = w.placeEntity("belt", miner.x - 1, f.y)!;
    tick(w, 5);
    expect(w.totals.tape).toBeGreaterThanOrEqual(4);
    expect(belt.belt!.items.length).toBeGreaterThan(0);
    // conservation: every produced item is either on the belt or in the
    // buffer — no duplication, no loss.
    expect(w.totals.tape).toBe(belt.belt!.items.length + miner.miner!.output.total);
  });

  it("belt items stay sorted ascending after pushes (queue-jump fix)", () => {
    const w = makeWorld();
    const minerId = rig(w);
    const miner = w.entities.get(minerId)!;
    const f = w.feeds[0]!;
    const belt = w.placeEntity("belt", miner.x + miner.w, f.y)!;
    tick(w, 6);
    const items = belt.belt!.items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.pos).toBeGreaterThanOrEqual(items[i - 1]!.pos);
    }
    // queue respects spacing: no two items closer than spacing - ε
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.pos - items[i - 1]!.pos).toBeGreaterThanOrEqual(0.24);
    }
  });
});

describe("crafting", () => {
  it("cleaner crafts clean data from tape (output buffer holds when no belt)", () => {
    const w = makeWorld();
    rig(w);
    const spot = findSpot(w, "cleaner", 40, 40, 2);
    powerNear(w, spot.x, spot.y);
    const c = w.placeEntity("cleaner", spot.x, spot.y)!;
    bufferAdd(c.machine!.crafter.input, "tape", 4);
    tick(w, 12); // 4 crafts × 2s
    expect(w.totals.clean).toBe(4);
    expect(c.machine!.crafter.input.total).toBe(0);
    expect(c.machine!.crafter.output.total).toBe(4);
  });

  it("crafting halts when inputs are missing", () => {
    const w = makeWorld();
    rig(w);
    const spot = findSpot(w, "cleaner", 40, 40, 2);
    powerNear(w, spot.x, spot.y);
    const c = w.placeEntity("cleaner", spot.x, spot.y)!;
    tick(w, 5);
    expect(w.totals.clean).toBe(0);
    expect(c.machine!.crafter.crafting).toBe(false);
  });

  it("unpowered machines never craft", () => {
    const w = makeWorld();
    rig(w);
    const spot = findSpot(w, "cleaner", 10, 10, 4); // far from any source
    const c = w.placeEntity("cleaner", spot.x, spot.y)!;
    bufferAdd(c.machine!.crafter.input, "tape", 4);
    tick(w, 5);
    expect(w.powered.has(c.id)).toBe(false);
    expect(w.totals.clean).toBe(0);
  });
});

describe("capital grid", () => {
  it("funding desks turn clean data into capital", () => {
    const w = makeWorld(7, 100_000);
    const f = w.feeds[0]!;
    const fundingSpot = findSpot(w, "funding", f.x + 10, f.y, 6);
    const funding = w.placeEntity("funding", fundingSpot.x, fundingSpot.y)!;
    bufferAdd(funding.funding!.input, "clean", 8); // input cap is 8 = 4s of fuel
    const before = w.capital;
    tick(w, 4);
    const expected = 40 * 4; // 40/s × 4s
    expect(w.capital).toBeGreaterThanOrEqual(before + expected * 0.9);
    expect(funding.funding!.input.total).toBeLessThan(8);
  });

  it("power propagates through links; far consumers stay unpowered", () => {
    const w = makeWorld();
    const f = w.feeds[0]!;
    const fs = findSpot(w, "funding", f.x + 10, f.y, 6);
    const funding = w.placeEntity("funding", fs.x, fs.y)!;
    let prev = { x: fs.x, y: fs.y };
    for (let i = 0; i < 2; i++) {
      const l = findSpot(w, "link", prev.x + 6, prev.y, 3);
      w.placeEntity("link", l.x, l.y);
      prev = l;
    }
    const near = findSpot(w, "cleaner", fs.x + 2, fs.y, 4);
    const nearE = w.placeEntity("cleaner", near.x, near.y)!;
    const far = findSpot(w, "cleaner", 10, 10, 4);
    const farE = w.placeEntity("cleaner", far.x, far.y)!;
    tickWorld(w, DT);
    expect(w.powered.has(funding.id)).toBe(true);
    expect(w.powered.has(nearE.id)).toBe(true);
    expect(w.powered.has(farE.id)).toBe(false);
  });

  it("brownout: zero reserve stalls production", () => {
    const w = makeWorld(7);
    rig(w);
    const spot = findSpot(w, "cleaner", 40, 40, 2);
    powerNear(w, spot.x, spot.y);
    const c = w.placeEntity("cleaner", spot.x, spot.y)!;
    bufferAdd(c.machine!.crafter.input, "tape", 4);
    w.capital = 0;
    tick(w, 5);
    expect(w.multiplier).toBe(0);
    expect(w.totals.clean).toBe(0);
  });
});

describe("traders", () => {
  it("moves items from belt to machine input with cooldown", () => {
    const w = makeWorld();
    rig(w);
    const spot = findSpot(w, "cleaner", 40, 40, 2);
    powerNear(w, spot.x, spot.y);
    const c = w.placeEntity("cleaner", spot.x, spot.y)!;
    // belt two tiles south (cleaner spans y..y+2), trader between them
    const b = w.placeEntity("belt", spot.x, spot.y + 4)!;
    b.belt!.items.push({ item: "tape", pos: 0.99 });
    const t = w.placeEntity("trader", spot.x, spot.y + 3)!;
    t.trader!.dir = "S"; // pickup south (belt), drop north (cleaner)
    tick(w, 3.5);
    // The cleaner consumes the tape while crafting — assert on the output.
    expect(w.totals.clean).toBe(1);
    expect(c.machine!.crafter.output.total).toBe(1);
    expect(t.trader!.cooldownMs).toBeLessThan(2_000);
  });
});

describe("determinism", () => {
  it("same seed + same actions → identical state after 60s", () => {
    const build = () => {
      const w = makeWorld(42, 500_000);
      const minerId = rig(w);
      const miner = w.entities.get(minerId)!;
      const f = w.feeds[0]!;
      w.placeEntity("belt", miner.x + miner.w, f.y);
      const spot = findSpot(w, "cleaner", 40, 40);
      powerNear(w, 40, 40);
      const c = w.placeEntity("cleaner", spot.x, spot.y)!;
      bufferAdd(c.machine!.crafter.input, "tape", 3);
      tick(w, 60);
      return w;
    };
    const a = build();
    const b = build();
    expect(a.capital).toBeCloseTo(b.capital, 6);
    expect(a.totals).toEqual(b.totals);
    expect(JSON.stringify([...a.entities.values()])).toBe(JSON.stringify([...b.entities.values()]));
  });
});
