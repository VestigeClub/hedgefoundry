import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World, type EntityKind } from "./world";
import { bufferAdd } from "./production";
import { serializeWorld, deserializeWorld, mapFromSave } from "./save";

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
    expect(b.lossReason).toBe(a.lossReason);
    expect(b.brosKilled).toBe(a.brosKilled);
    expect(b.hiresByType).toEqual(a.hiresByType);
    expect(b.waves).toBe(a.waves);
    expect(b.timeline).toEqual(a.timeline);
    expect(b.capHistory).toEqual(a.capHistory);

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
    expect(b.brosKilled).toBe(a.brosKilled);
    expect(b.waves).toBe(a.waves);
    expect(b.timeline).toEqual(a.timeline);
  });

  it("rejects unknown versions", () => {
    expect(() => deserializeWorld('{"v":99}')).toThrow(/version/);
  });

  it("refuses v1 saves", () => {
    // v2 added the report stats; a v1 payload has no lossReason/timeline to
    // restore, so it is refused rather than half-loaded.
    const raw = JSON.parse(serializeWorld(buildWorld(), MAP_OPTS)) as { v: number };
    raw.v = 1;
    const v1 = JSON.stringify(raw);
    expect(() => deserializeWorld(v1)).toThrow(/unsupported version 1/);
    expect(() => mapFromSave(v1)).toThrow(/unsupported version 1/);
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

  it("round-trips the P3 report fields", () => {
    const w = buildWorld();
    const analyst = w.spawnBro("analyst", 30, 30)!;
    expect(w.hireBro(analyst.id)).toBe(true);
    const quant = w.spawnBro("quant", 31, 31)!;
    expect(w.damageEntity(quant.id, 10_000)).toBe(true);
    const hq = w.entities.get(w.hqId)!;
    expect(w.damageEntity(hq.id, 10_000)).toBe(true); // → lossReason + timeline entry
    w.waves = 4;
    w.capHistory.push({ t: w.timeMs, capital: w.capital, alpha: w.totals.alpha });

    const { world: b } = deserializeWorld(serializeWorld(w, MAP_OPTS));
    expect(b.state).toBe("lost");
    expect(b.lossReason).toBe("hq");
    expect(b.brosKilled).toBe(1);
    expect(b.hired).toBe(1);
    expect(b.hiresByType).toEqual(w.hiresByType);
    expect(b.hiresByType.analyst).toBe(1);
    expect(b.waves).toBe(4);
    expect(b.timeline).toEqual(w.timeline);
    expect(b.timeline[b.timeline.length - 1]?.msg).toBe("HQ OVERRUN");
    expect(b.capHistory).toEqual(w.capHistory);

    // Restored arrays are copies, not aliases of the parsed payload.
    b.logEvent("AFTER LOAD");
    expect(w.timeline[w.timeline.length - 1]?.msg).not.toBe("AFTER LOAD");
  });

  it("round-trips the fuel a funding desk is selling", () => {
    const w = buildWorld();
    const desk = [...w.entities.values()].find((e) => e.kind === "funding")!;
    expect(desk.funding!.selling).toBeNull(); // idle desk: null survives as null
    desk.funding!.selling = "alpha"; // what updateFunding writes mid-tick

    const { world: b } = deserializeWorld(serializeWorld(w, MAP_OPTS));
    const restored = [...b.entities.values()].find((e) => e.kind === "funding")!;
    expect(restored.funding!.selling).toBe("alpha");
    expect(restored.funding!.input.items).toEqual(desk.funding!.input.items);

    const idle = deserializeWorld(serializeWorld(buildWorld(), MAP_OPTS)).world;
    const idleDesk = [...idle.entities.values()].find((e) => e.kind === "funding")!;
    expect(idleDesk.funding!.selling).toBeNull();
  });
});
