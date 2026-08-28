import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World, type Entity, type EntityKind } from "./world";
import { bufferAdd, bufferTake } from "./production";
import { FUNDING_FUELS } from "./recipes";

const DT = 33.3333;

function makeWorld(seed = 7, startCapital = 2_000_000): World {
  const { map, feeds } = generateMap({ width: 128, height: 128, seed, startClearRadius: 14, poolClusters: 25 });
  return new World({ map, feeds, seed, startCapital });
}

function place(w: World, kind: EntityKind, sx: number, sy: number, win = 16): Entity {
  for (let y = sy - win; y <= sy + win; y++) {
    for (let x = sx - win; x <= sx + win; x++) {
      const e = w.placeEntity(kind, x, y);
      if (e) return e;
    }
  }
  throw new Error(`no room for ${kind} near ${sx},${sy}`);
}

/** Place a vault so every listed entity ends up powered (throws if impossible). */
function powerAll(w: World, need: Entity[]): void {
  const ax = Math.round(need.reduce((s, e) => s + e.x, 0) / need.length);
  const ay = Math.round(need.reduce((s, e) => s + e.y, 0) / need.length);
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const v = w.placeEntity("vault", ax + dx, ay + dy);
        if (!v) continue;
        w.recomputePower();
        if (need.every((e) => w.powered.has(e.id))) return;
        w.removeEntity(v.id);
      }
    }
  }
  throw new Error("could not power the line");
}

function tick(w: World, seconds: number): void {
  const steps = Math.round((seconds * 1000) / DT);
  for (let i = 0; i < steps; i++) tickWorld(w, DT);
}

/** Belt immediately west of `to`, pointing into it, carrying `item` at the head. */
function feedInto(w: World, to: Entity, item: "clean" | "signal" | "alpha" | "brief" | "tape"): Entity {
  const at = { x: to.x - 1, y: to.y };
  const belt = w.placeEntity("belt", at.x, at.y);
  if (!belt) throw new Error(`no belt room west of ${to.kind}`);
  belt.belt!.dir = "E";
  belt.belt!.items.push({ item, pos: 0.99 });
  return belt;
}

describe("delivery targets", () => {
  it("a belt head feeding a funding desk delivers its fuel", () => {
    const w = makeWorld(7, 500_000);
    const desk = place(w, "funding", 60, 60, 6);
    const belt = feedInto(w, desk, "clean");
    const clean = FUNDING_FUELS.find((x) => x.fuel === "clean")!;
    // A desk burns exactly one cleaner line's output — FUNDING_FUELS ratePerSec =
    // recipeRate(clean) = 1000/1000 = 1/s — for FUEL_PRICE.clean 250 (recipes.ts:58).
    expect(clean.ratePerSec).toBe(1);
    // So 0.2 s of selling eats at most 0.2 units: the delivery is still in the
    // buffer, and the belt has already handed it over.
    tick(w, 0.2);
    expect(belt.belt!.items.length).toBe(0);
    const left = desk.funding!.input.items.clean ?? 0;
    expect(left).toBeLessThan(1); // the desk got it and started burning it
    expect(left).toBeGreaterThan(1 - clean.ratePerSec * 0.2); // ≥ 0.8 of it
    const after = w.capital;
    tick(w, 2); // 2 s outlasts the ~0.83 s of fuel still in hand
    // The rest paid out at the clean price: capPerSec × seconds of fuel burned
    // = 250 × (left ÷ 1 per s) ≈ 208 (update.ts:87 prorates by taken/want).
    expect(w.capital - after).toBeCloseTo(clean.capPerSec * (left / clean.ratePerSec), 1);
    expect(desk.funding!.input.total).toBe(0);
    expect(desk.funding!.selling).toBeNull(); // dry: nothing left to sell
  });

  it("a belt head feeding a compliance tower delivers briefs", () => {
    const w = makeWorld();
    const tower = place(w, "tower", 60, 60, 6);
    feedInto(w, tower, "brief");
    tick(w, 0.2);
    expect(tower.input!.items.brief).toBe(1);
  });

  it("a belt head feeding the roadshow delivers alpha", () => {
    const w = makeWorld(7, 5_000_000);
    const rs = place(w, "roadshow", 60, 60, 6);
    feedInto(w, rs, "alpha");
    tick(w, 0.2);
    expect(rs.input!.items.alpha).toBe(1);
  });

  it("a belt refuses to dump an item the machine does not eat", () => {
    const w = makeWorld();
    const cleaner = place(w, "cleaner", 60, 60, 6);
    const belt = feedInto(w, cleaner, "alpha"); // recipe wants tape
    tick(w, 1);
    expect(belt.belt!.items.length).toBe(1);
    expect(cleaner.machine!.crafter.input.total).toBe(0);
  });
});

describe("trader honesty", () => {
  it("leaves the source item in place when the destination refuses it", () => {
    const w = makeWorld(7, 500_000);
    const desk = place(w, "funding", 70, 70, 6); // tier 0 burns CLEAN DATA
    const trader = w.placeEntity("trader", desk.x - 1, desk.y);
    expect(trader).not.toBeNull();
    trader!.trader!.dir = "W"; // arm west onto the belt, swings east into the desk
    const src = w.placeEntity("belt", desk.x - 2, desk.y);
    expect(src).not.toBeNull();
    src!.belt!.dir = "W";
    src!.belt!.items.push({ item: "signal", pos: 0.9 });
    tick(w, 2);
    expect(src!.belt!.items.length).toBe(1); // not picked up, not destroyed
    expect(src!.belt!.items[0]!.item).toBe("signal");
    expect(desk.funding!.input.items.signal ?? 0).toBe(0);
  });
});

describe("backpressure", () => {
  it("a full output buffer jams the machine instead of eating the craft", () => {
    const w = makeWorld();
    place(w, "vault", 40, 40, 2);
    const cleaner = place(w, "cleaner", 44, 40, 3);
    const c = cleaner.machine!.crafter;
    bufferAdd(c.input, "tape", 8);
    bufferAdd(c.output, "clean", 4); // output cap is 4: the craft has nowhere to go
    const before = w.totals.clean;
    tick(w, 3);
    expect(c.blocked).toBe(true);
    expect(w.totals.clean).toBe(before);
    expect(c.output.total).toBe(4);
    bufferTake(c.output, "clean", 4);
    tick(w, 3);
    expect(c.blocked).toBe(false);
    expect(w.totals.clean).toBeGreaterThan(before);
  });

  it("credits and preserves every unit a jammed line makes", () => {
    const w = makeWorld();
    // Miner on a feed patch with two free tiles to its right: belt, then a
    // cleaner on floor (cleaners cannot sit on a feed).
    let miner: Entity | null = null;
    for (const f of w.feeds) {
      for (let y = f.y; y < f.y + f.h && !miner; y++) {
        for (let x = f.x + f.w - 1; x >= f.x && !miner; x--) {
          if (
            w.canPlace("miner", x, y) === null &&
            w.canPlace("belt", x + 2, y) === null &&
            w.canPlace("cleaner", x + 3, y) === null
          ) {
            miner = w.placeEntity("miner", x, y);
          }
        }
      }
      if (miner) break;
    }
    expect(miner).not.toBeNull();
    const belt = w.placeEntity("belt", miner!.x + 2, miner!.y);
    expect(belt).not.toBeNull();
    belt!.belt!.dir = "E";
    const cleaner = w.placeEntity("cleaner", miner!.x + 3, miner!.y);
    expect(cleaner).not.toBeNull();
    powerAll(w, [miner!, cleaner!]);

    tick(w, 30);
    const saturated = w.totals.tape;
    tick(w, 30);
    // Fully jammed: the miner must not bank credit to pay out later.
    expect(w.totals.tape).toBe(saturated);
    expect(w.totals.clean).toBeGreaterThan(0);

    let clean = 0;
    let tape = 0;
    for (const e of w.entities.values()) {
      if (e.belt) {
        for (const it of e.belt.items) {
          if (it.item === "clean") clean++;
          if (it.item === "tape") tape++;
        }
      }
      if (e.machine) {
        clean += e.machine.crafter.output.items.clean ?? 0;
        clean += e.machine.crafter.input.items.clean ?? 0;
        tape += e.machine.crafter.input.items.tape ?? 0;
      }
      if (e.miner) tape += e.miner.output.items.tape ?? 0;
    }
    // Nothing on this line consumes clean, so every unit the totals claim must
    // still exist somewhere in the world.
    expect(w.totals.clean).toBe(clean);
    // Tape: in the world, or spent on the clean we accounted for (1 tape each),
    // with at most one craft in flight.
    expect(w.totals.tape).toBeGreaterThanOrEqual(tape + w.totals.clean);
    expect(w.totals.tape).toBeLessThanOrEqual(tape + w.totals.clean + 1);
  });

  /**
   * The bug this guards: an output buffer used to be emptied only on the tick
   * a craft completed. One legal refusal — a full belt, or a sink at its
   * ingredient cap — therefore stranded those units permanently: `blocked`
   * never cleared, the buffer stayed full, the line behind it starved, and
   * nothing in the game would ever retry the delivery. On the 50-minute
   * scripted run this is what froze the research desk's alpha feed at the
   * second tech for the remaining 46 minutes. `updateMachine` now pushes the
   * output every tick, so a jam that clears must restart the line by itself.
   */
  it("retries a delivery the belt refused once the lane clears", () => {
    const w = makeWorld(7, 500_000);
    const maker = place(w, "cleaner", 60, 60, 6);
    const belt = w.placeEntity("belt", maker.x + maker.w, maker.y);
    expect(belt).not.toBeNull();
    belt!.belt!.dir = "E";
    // The lane head is another cleaner, which eats tape, not clean data: the
    // belt fills, the output buffer fills, the maker blocks. This is the state
    // a real jam leaves behind, and it is stable — nothing resolves it.
    const jam = w.placeEntity("cleaner", maker.x + maker.w + 1, maker.y);
    expect(jam).not.toBeNull();
    powerAll(w, [maker, jam!]);
    // An input buffer holds eight units, so the feed is topped up by hand: the
    // line has to still be producing while its output is refused, because that
    // is the state the bug lived in.
    for (let s = 0; s < 20; s++) {
      bufferAdd(maker.machine!.crafter.input, "tape", 8);
      tick(w, 1);
    }
    expect(maker.machine!.crafter.blocked).toBe(true);
    expect(maker.machine!.crafter.output.total).toBe(maker.machine!.crafter.output.cap);

    // Clear the jam the way a player does: the dead sink comes out, a funding
    // desk (which does buy clean data) goes in, the wire stays where it was.
    w.removeEntity(jam!.id);
    const desk = w.placeEntity("funding", jam!.x, jam!.y);
    expect(desk).not.toBeNull();
    powerAll(w, [maker, desk!]);
    for (let s = 0; s < 10; s++) {
      bufferAdd(maker.machine!.crafter.input, "tape", 8);
      tick(w, 1);
    }

    // No one touched the maker's buffers: the stragglers left on their own and
    // the machine is crafting again.
    expect(maker.machine!.crafter.blocked).toBe(false);
    expect(maker.machine!.crafter.output.total).toBe(0);
    let downstream = desk!.funding!.input.items.clean ?? 0;
    for (const e of w.entities.values()) {
      if (e.belt) downstream += e.belt.items.filter((i) => i.item === "clean").length;
    }
    expect(downstream).toBeGreaterThan(0);
  });
});
