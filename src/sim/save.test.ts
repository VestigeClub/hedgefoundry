import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World, type EntityKind } from "./world";
import { bufferAdd } from "./production";
import { serializeWorld, deserializeWorld } from "./save";

const DT = 33.3333;
const MAP_OPTS = { width: 128, height: 128, seed: 7, startClearRadius: 14, poolClusters: 25 };

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

function buildWorld(): World {
  const { map, feeds } = generateMap(MAP_OPTS);
  const w = new World({ map, feeds, seed: MAP_OPTS.seed });
  const hq = w.spawnHQ();
  hq.hp = 300;
  const f = w.feeds[0]!;
  w.placeEntity("miner", f.x, f.y);
  const funding = findSpot(w, "funding", f.x + 10, f.y, 6);
  w.placeEntity("funding", funding.x, funding.y);
  const vault = findSpot(w, "vault", f.x + 14, f.y, 6);
  w.placeEntity("vault", vault.x, vault.y);
  const clean = findSpot(w, "cleaner", f.x + 4, f.y, 4);
  w.placeEntity("cleaner", clean.x, clean.y);
  tick(w, 15);
  return w;
}

describe("save/load", () => {
  it("round-trips a live world and resumes identically", () => {
    const a = buildWorld();
    const aCopy = buildWorld(); // same seed+actions → identical pre-save state
    expect(a.capital).toBeCloseTo(aCopy.capital, 6);
    expect(a.totals.tape).toBe(aCopy.totals.tape);

    const json = serializeWorld(a, MAP_OPTS);
    const { world: b } = deserializeWorld(json);

    // Core fields survive.
    expect(b.capital).toBeCloseTo(a.capital, 6);
    expect(b.timeMs).toBe(a.timeMs);
    expect(b.nextId).toBe(a.nextId);
    expect(b.entities.size).toBe(a.entities.size);
    expect(b.totals).toEqual(a.totals);
    expect(b.tech).toEqual(a.tech);
    expect(b.researched).toEqual(a.researched);
    expect(b.evolution).toBe(a.evolution);
    expect(b.hired).toBe(a.hired);
    expect(b.hqId).toBe(a.hqId);
    expect(Array.from(b.impact)).toEqual(Array.from(a.impact));

    // Per-entity internals survive.
    for (const [id, ea] of a.entities) {
      const eb = b.entities.get(id)!;
      expect(eb).toBeDefined();
      expect(eb.x).toBe(ea.x);
      expect(eb.y).toBe(ea.y);
      expect(eb.hp).toBe(ea.hp);
      if (ea.machine) {
        expect(eb.machine!.crafter.crafting).toBe(ea.machine.crafter.crafting);
        expect(eb.machine!.crafter.progressMs).toBeCloseTo(ea.machine.crafter.progressMs, 6);
        expect(eb.machine!.crafter.input.items).toEqual(ea.machine.crafter.input.items);
        expect(eb.machine!.crafter.output.items).toEqual(ea.machine.crafter.output.items);
      }
      if (ea.belt) expect(eb.belt!.items).toEqual(ea.belt.items);
      if (ea.bro) expect(eb.bro!.xf).toBeCloseTo(ea.bro.xf, 6);
    }

    // Determinism continues: original vs restored tick forward identically.
    tick(a, 30);
    tick(b, 30);
    expect(b.capital).toBeCloseTo(a.capital, 6);
    expect(b.timeMs).toBe(a.timeMs);
    expect(b.totals).toEqual(a.totals);
    expect(Array.from(b.impact)).toEqual(Array.from(a.impact));
    expect(b.rng.state()).toBe(a.rng.state());
  });

  it("rejects unknown versions", () => {
    expect(() => deserializeWorld('{"v":99}')).toThrow(/version/);
  });

  it("saves bros, towers, and roadshow state", () => {
    const { map, feeds } = generateMap(MAP_OPTS);
    const w = new World({ map, feeds, seed: MAP_OPTS.seed, startCapital: 50_000_000 });
    w.spawnHQ();
    w.spawnBro("analyst", 10, 10);
    w.spawnBro("md", 12, 12);
    w.broSpawnTimerMs = 1234;
    w.marginCallMs = 999;
    w.hired = 7;
    w.evolution = 0.33;
    const rs = findSpot(w, "roadshow", 30, 30);
    const roadshow = w.placeEntity("roadshow", rs.x, rs.y)!;
    for (let i = 0; i < 5; i++) bufferAdd(roadshow.input!, "alpha", 1);
    roadshow.roadshow!.progress = 42;
    const towerSpot = findSpot(w, "tower", 40, 40);
    const tower = w.placeEntity("tower", towerSpot.x, towerSpot.y)!;
    bufferAdd(tower.input!, "brief", 3);

    const { world: b } = deserializeWorld(serializeWorld(w, MAP_OPTS));
    expect(b.broSpawnTimerMs).toBe(1234);
    expect(b.marginCallMs).toBe(999);
    expect(b.hired).toBe(7);
    expect(b.evolution).toBe(0.33);
    const rb = [...b.entities.values()].find((e) => e.kind === "roadshow")!;
    expect(rb.roadshow!.progress).toBe(42);
    expect(rb.input!.items.alpha).toBe(5);
    const tb = [...b.entities.values()].find((e) => e.kind === "tower")!;
    expect(tb.input!.items.brief).toBe(3);
    const bros = [...b.entities.values()].filter((e) => e.kind === "bro");
    expect(bros.length).toBe(2);
  });
});
