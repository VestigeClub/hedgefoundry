import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { World, type Entity, type EntityKind } from "../sim/world";
import { TUTORIAL_STEPS, troubleTip } from "./steps";
import { Tutorial } from "./tutorial";

const DT = 100; // engine throttle is 100 ms

function makeWorld(seed = 7, startCapital = 400_000): World {
  const { map, feeds } = generateMap({ width: 128, height: 128, seed, startClearRadius: 14, poolClusters: 25 });
  return new World({ map, feeds, seed, startCapital });
}

/** Probe for room near (sx, sy); a miner must sit on a feed patch. */
function place(w: World, kind: EntityKind, sx = 64, sy = 64, win = 24): Entity {
  if (kind === "miner") {
    const f = w.feeds[0]!;
    const m = w.placeEntity("miner", f.x, f.y);
    if (m) return m;
    throw new Error("no room on feeds[0] for miner");
  }
  for (let y = sy - win; y <= sy + win; y++) {
    for (let x = sx - win; x <= sx + win; x++) {
      const e = w.placeEntity(kind, x, y);
      if (e) return e;
    }
  }
  throw new Error(`no room for ${kind} near ${sx},${sy}`);
}

/** Belt east of the feeds[0] miner, adjacent to its footprint. */
function placeBeltAtMiner(w: World): Entity {
  const f = w.feeds[0]!;
  const b = w.placeEntity("belt", f.x + 2, f.y);
  if (b) return b;
  throw new Error("no room east of miner for belt");
}

/** Drive steps 0→5 with a scripted fresh world. */
function toMoneyStep(): { w: World; t: Tutorial } {
  const w = makeWorld();
  const t = new Tutorial();
  t.update(w, DT, { cameraMoved: true }); // → 1
  place(w, "miner");
  t.update(w, DT, { cameraMoved: false }); // → 2
  placeBeltAtMiner(w);
  t.update(w, DT, { cameraMoved: false }); // → 3
  place(w, "cleaner");
  t.update(w, DT, { cameraMoved: false }); // → 4
  place(w, "funding");
  t.update(w, DT, { cameraMoved: false }); // → 5
  expect(t.snapshot.step).toBe(5);
  return { w, t };
}

describe("tutorial step engine", () => {
  it("declares exactly the 10 designed steps", () => {
    expect(TUTORIAL_STEPS).toHaveLength(10);
    expect(TUTORIAL_STEPS[0]!.id).toBe("welcome");
    expect(TUTORIAL_STEPS[9]!.id).toBe("sendoff");
  });

  it("advances one step at a time, in order", () => {
    const w = makeWorld();
    const t = new Tutorial();
    expect(t.snapshot.step).toBe(0);

    // camera moves → step 0 done, but NOT past step 1
    t.update(w, DT, { cameraMoved: true });
    expect(t.snapshot.step).toBe(1);

    place(w, "miner");
    t.update(w, DT, { cameraMoved: false });
    expect(t.snapshot.step).toBe(2); // miner done → belt step, no further

    place(w, "cleaner"); // cleaner before belt: must NOT advance (step is belt)
    t.update(w, DT, { cameraMoved: false });
    expect(t.snapshot.step).toBe(2);
  });

  it("step 0 completes on camera movement or a 12 s timeout", () => {
    const w = makeWorld();
    const t1 = new Tutorial();
    for (let i = 0; i < 61; i++) t1.update(w, 200, { cameraMoved: false });
    expect(t1.snapshot.step).toBe(1); // 61 × 200 ms > 12 s

    const t2 = new Tutorial();
    t2.update(w, DT, { cameraMoved: true });
    expect(t2.snapshot.step).toBe(1);
  });

  it("skip marks done and update is a no-op after", () => {
    const w = makeWorld();
    const t = new Tutorial();
    t.skip();
    expect(t.snapshot.done).toBe(true);
    place(w, "miner");
    t.update(w, DT, { cameraMoved: true });
    expect(t.snapshot.step).toBe(0);
    expect(t.snapshot.done).toBe(true);
  });

  it("MONEY FLOWING pays off on real income (trough + $10k)", () => {
    const { w, t } = toMoneyStep();
    // no movement of capital → still step 5
    t.update(w, DT, { cameraMoved: false });
    expect(t.snapshot.step).toBe(5);

    w.capital = w.capital + 10_001;
    t.update(w, DT, { cameraMoved: false });
    expect(t.snapshot.step).toBe(6);
  });

  it("steps 6–8 trigger on tower, hire, research target", () => {
    const { w, t } = toMoneyStep();
    w.capital = w.capital + 10_001;
    t.update(w, DT, { cameraMoved: false }); // → 6 defend
    expect(t.snapshot.step).toBe(6);

    place(w, "tower");
    t.update(w, DT, { cameraMoved: false });
    expect(t.snapshot.step).toBe(7); // → hire

    const bro = w.spawnBro("analyst", 10, 10);
    expect(w.hireBro(bro!.id)).toBe(true);
    t.update(w, DT, { cameraMoved: false });
    expect(t.snapshot.step).toBe(8); // → research

    w.setResearchTarget("tape-speed-1");
    t.update(w, DT, { cameraMoved: false });
    expect(t.snapshot.step).toBe(9); // → sendoff
  });

  it("highlights resolve to world-space rects for every step", () => {
    const w = makeWorld();
    w.spawnHQ();
    for (const step of TUTORIAL_STEPS) {
      const target = step.highlight(w);
      expect(target === null || (target.w > 0 && target.h > 0)).toBe(true);
    }
    // step 1 must point at a feed patch
    expect(TUTORIAL_STEPS[1]!.highlight(w)).not.toBeNull();
  });

  it("troubleTip fires on brownout and on healthy world returns null", () => {
    const w = makeWorld();
    expect(troubleTip(w)).toBeNull();
    w.multiplier = 0.5;
    expect(troubleTip(w)).toMatch(/brownout/i);
  });
});
