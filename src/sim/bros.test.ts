import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World, BRO_STATS, HIRE_QUOTA, type EntityKind } from "./world";
import { bufferAdd } from "./production";
import { RECIPES } from "./recipes";
import { applyTech } from "./research";

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

function powerNear(w: World, sx: number, sy: number): void {
  const v = findSpot(w, "vault", sx, sy, 2);
  w.placeEntity("vault", v.x, v.y);
}

function tick(w: World, seconds: number): void {
  const steps = Math.round((seconds * 1000) / DT);
  for (let i = 0; i < steps; i++) tickWorld(w, DT);
}

function spawnBro(w: World, type: "analyst" | "trader" | "md" | "quant", x: number, y: number): number {
  return w.spawnBro(type, x, y)!.id;
}

describe("market impact", () => {
  it("burning machines emit impact that persists and decays", () => {
    const w = makeWorld();
    powerNear(w, 40, 40);
    w.placeEntity("cleaner", 40, 40);
    tick(w, 5);
    expect(w.totalImpact()).toBeGreaterThan(0);
    tick(w, 5);
    expect(w.totalImpact()).toBeGreaterThan(0);
  });

  it("impact drives evolution upward, capped at 1", () => {
    const w = makeWorld();
    powerNear(w, 40, 40);
    w.placeEntity("cleaner", 40, 40);
    tick(w, 30);
    expect(w.evolution).toBeGreaterThan(0);
    w.evolution = 1;
    tick(w, 5);
    expect(w.evolution).toBeLessThanOrEqual(1);
  });
});

describe("finance bros", () => {
  it("spawns waves at map edges with type mix by evolution", () => {
    const w = makeWorld();
    w.broSpawnTimerMs = 500;
    tick(w, 1);
    const bros = [...w.entities.values()].filter((e) => e.kind === "bro");
    expect(bros.length).toBeGreaterThan(0);
    for (const b of bros) {
      const nearEdge = b.x <= 5 || b.y <= 5 || b.x >= w.map.w - 6 || b.y >= w.map.h - 6;
      expect(nearEdge).toBe(true);
    }
  });

  it("bro attacks and destroys an adjacent machine", () => {
    const w = makeWorld();
    const f = w.feeds[0]!;
    const m = w.placeEntity("miner", f.x, f.y)!;
    m.hp = 5;
    m.maxHp = 5;
    powerNear(w, f.x, f.y);
    spawnBro(w, "analyst", f.x + 2, f.y); // 2 dmg/s → 5hp in ~3s
    tick(w, 6);
    expect(w.entities.has(m.id)).toBe(false);
  });

  it("bros march toward the HQ when impact is flat", () => {
    const w = makeWorld();
    w.spawnHQ();
    spawnBro(w, "analyst", 20, 20);
    tick(w, 10);
    const bro = [...w.entities.values()].find((e) => e.kind === "bro")!;
    expect(bro.x + bro.y).toBeGreaterThan(22); // moved from the corner
  });

  it("destroying the HQ loses the game", () => {
    const w = makeWorld();
    const hq = w.spawnHQ();
    hq.hp = 10;
    hq.maxHp = 500;
    spawnBro(w, "trader", hq.x + 2, hq.y + 2); // 6 dmg/s
    tick(w, 4);
    expect(w.state).toBe("lost");
  });

  it("bros chase machines through the impact blob instead of stalling", () => {
    // Regression: greedy impact-maximizing stalled bros at the blob's local
    // maximum one tile from a machine; they must now pursue and chew it.
    const w = makeWorld();
    const f = w.feeds[0]!;
    const m = w.placeEntity("miner", f.x, f.y)!;
    m.hp = 10;
    m.maxHp = 10;
    powerNear(w, f.x, f.y);
    spawnBro(w, "analyst", f.x + 4, f.y); // just outside chase range (10)
    tick(w, 20); // ample time to approach + chew
    expect(w.entities.has(m.id)).toBe(false);
  });
});

describe("compliance towers", () => {
  it("tower kills a bro with brief ammo when powered", () => {
    const w = makeWorld();
    powerNear(w, 30, 30);
    const t = w.placeEntity("tower", 30, 30)!;
    bufferAdd(t.input!, "brief", 5);
    const broId = spawnBro(w, "analyst", 35, 30); // 20hp vs 8 dmg/hit @2/s
    tick(w, 3);
    expect(w.entities.has(broId)).toBe(false);
    expect(t.input!.items.brief ?? 0).toBeLessThan(5);
  });

  it("tower without power does nothing", () => {
    const w = makeWorld();
    const t = w.placeEntity("tower", 30, 30)!;
    bufferAdd(t.input!, "brief", 5);
    const broId = spawnBro(w, "analyst", 34, 30);
    tick(w, 3);
    expect(w.entities.has(broId)).toBe(true);
    expect(w.powered.has(t.id)).toBe(false);
  });
});

describe("hiring", () => {
  it("hireBro pays comp, counts quota, removes the bro", () => {
    const w = makeWorld(7, 1_000_000);
    const id = spawnBro(w, "analyst", 10, 10);
    const capBefore = w.capital;
    expect(w.hireBro(id)).toBe(true);
    expect(w.capital).toBe(capBefore - BRO_STATS.analyst.comp);
    expect(w.hired).toBe(1);
    expect(w.entities.has(id)).toBe(false);
  });

  it("cannot hire when broke", () => {
    const w = makeWorld(7, 1_000);
    const id = spawnBro(w, "md", 10, 10);
    expect(w.hireBro(id)).toBe(false);
    expect(w.hired).toBe(0);
    expect(w.entities.has(id)).toBe(true);
  });

  it("comp discount tech cuts the price", () => {
    const w = makeWorld(7, 1_000_000);
    applyTech(w, "comp-discount-1");
    const id = spawnBro(w, "analyst", 10, 10);
    const capBefore = w.capital;
    w.hireBro(id);
    expect(w.capital).toBe(capBefore - Math.round(BRO_STATS.analyst.comp * 0.85));
  });
});

describe("victory / defeat", () => {
  it("margin call: 10s at zero capital loses", () => {
    const w = makeWorld(7, 0);
    tick(w, 9);
    expect(w.state).toBe("playing");
    tick(w, 2);
    expect(w.state).toBe("lost");
  });

  it("roadshow IPO: quota + alpha delivery wins", () => {
    const w = makeWorld(7, 50_000_000);
    powerNear(w, 40, 40);
    const rs = w.placeEntity("roadshow", 40, 40)!;
    for (let i = 0; i < 16; i++) bufferAdd(rs.input!, "alpha", 1);
    w.hired = HIRE_QUOTA;
    rs.roadshow!.progress = 396;
    tick(w, 2); // 4 alpha/s → progress crosses 400
    expect(w.state).toBe("won");
  });

  it("roadshow idles below quota and consumes no alpha", () => {
    const w = makeWorld(7, 50_000_000);
    powerNear(w, 40, 40);
    const rs = w.placeEntity("roadshow", 40, 40)!;
    bufferAdd(rs.input!, "alpha", 10);
    w.hired = 0;
    tick(w, 5);
    expect(rs.input!.items.alpha ?? 0).toBe(10);
    expect(w.state).toBe("playing");
  });

  it("sim freezes after game over", () => {
    const w = makeWorld(7, 0);
    tick(w, 11);
    expect(w.state).toBe("lost");
    const t = w.timeMs;
    tick(w, 2);
    expect(w.timeMs).toBe(t);
  });

  it("brief efficiency tech raises printer output to 3", () => {
    const w = makeWorld();
    expect(RECIPES.brief!.out.brief).toBe(2);
    applyTech(w, "brief-efficiency");
    expect(RECIPES.brief!.out.brief).toBe(3);
  });
});

describe("conservation", () => {
  it("totals still hold with bros, towers, and hq on the map", () => {
    const w = makeWorld();
    powerNear(w, 40, 40);
    w.spawnHQ();
    w.placeEntity("tower", 40, 40);
    spawnBro(w, "analyst", 10, 10);
    tick(w, 5);
    let onBelts = 0;
    let inBuffers = 0;
    for (const e of w.entities.values()) {
      if (e.belt) onBelts += e.belt.items.length;
      if (e.machine) inBuffers += e.machine.crafter.input.total + e.machine.crafter.output.total;
      if (e.miner) inBuffers += e.miner.output.total;
      if (e.funding) inBuffers += e.funding.input.total;
      if (e.input) inBuffers += e.input.total;
    }
    const total = (["tape", "clean", "signal", "alpha", "brief"] as const).reduce((s, it) => s + w.totals[it], 0);
    expect(total).toBe(onBelts + inBuffers);
  });
});
