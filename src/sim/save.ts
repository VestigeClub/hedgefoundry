/**
 * Save/load (DESIGN.md §10, M6). The world is plain data: entities, totals,
 * tech, impact, and the RNG stream state serialize to JSON. The map is
 * regenerated deterministically from its seed+opts, so saves stay small.
 */
import type { TileMap } from "../world/tilemap";
import { generateMap, type GenOptions as MapGenOpts, type FeedPatch } from "../world/mapgen";
import { Rng } from "./rng";
import { Crafter } from "./production";
import { RECIPES } from "./recipes";
import { World, type BeltItem, type BroType, type Dir, type Entity } from "./world";
import type { Item } from "./items";

const SAVE_KEY = "hedgefoundry-save-v1";

interface SaveFormat {
  v: 1;
  map: MapGenOpts;
  world: {
    nextId: number;
    capital: number;
    timeMs: number;
    totals: Record<string, number>;
    tech: Record<string, number>;
    researched: string[];
    researchTarget: string | null;
    researchPoints: number;
    impact: number[];
    impactW: number;
    impactH: number;
    evolution: number;
    hired: number;
    state: "playing" | "won" | "lost";
    marginCallMs: number;
    broSpawnTimerMs: number;
    hqId: number;
    rngState: number;
  };
  entities: SerializedEntity[];
}

interface SerializedEntity {
  id: number;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  researchTarget?: string | null;
  hp?: number;
  maxHp?: number;
  input?: SerializedBuffer;
  machine?: { recipeId: string; crafting: boolean; progressMs: number; input: SerializedBuffer; output: SerializedBuffer };
  miner?: { output: SerializedBuffer; rateAcc: number };
  funding?: { input: SerializedBuffer; fuelAcc: number };
  belt?: { dir: Dir; speed: number; items: BeltItem[] };
  trader?: { dir: Dir; cooldownMs: number; busyMs: number };
  bro?: { type: BroType; atkCdMs: number; xf: number; yf: number };
  tower?: { atkCdMs: number };
  roadshow?: { progress: number };
}

interface SerializedBuffer {
  cap: number;
  items: Record<string, number>;
  total: number;
}

function serializeBuffer(buf: { cap: number; items: Partial<Record<Item, number>>; total: number }): SerializedBuffer {
  return { cap: buf.cap, items: { ...buf.items } as Record<string, number>, total: buf.total };
}

function serializeEntity(e: Entity): SerializedEntity {
  const s: SerializedEntity = { id: e.id, kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h };
  if (e.researchTarget !== undefined) s.researchTarget = e.researchTarget;
  if (e.hp !== undefined) s.hp = e.hp;
  if (e.maxHp !== undefined) s.maxHp = e.maxHp;
  if (e.input) s.input = serializeBuffer(e.input);
  if (e.machine) {
    s.machine = {
      recipeId: e.machine.crafter.recipe.id,
      crafting: e.machine.crafter.crafting,
      progressMs: e.machine.crafter.progressMs,
      input: serializeBuffer(e.machine.crafter.input),
      output: serializeBuffer(e.machine.crafter.output),
    };
  }
  if (e.miner) s.miner = { output: serializeBuffer(e.miner.output), rateAcc: e.miner.rateAcc };
  if (e.funding) s.funding = { input: serializeBuffer(e.funding.input), fuelAcc: e.funding.fuelAcc };
  if (e.belt) s.belt = { dir: e.belt.dir, speed: e.belt.speed, items: e.belt.items.map((i) => ({ ...i })) };
  if (e.trader) s.trader = { dir: e.trader.dir, cooldownMs: e.trader.cooldownMs, busyMs: e.trader.busyMs };
  if (e.bro) s.bro = { type: e.bro.type, atkCdMs: e.bro.atkCdMs, xf: e.bro.xf, yf: e.bro.yf };
  if (e.tower) s.tower = { atkCdMs: e.tower.atkCdMs };
  if (e.roadshow) s.roadshow = { progress: e.roadshow.progress };
  return s;
}

function deserializeBuffer(b: SerializedBuffer): { cap: number; items: Partial<Record<Item, number>>; total: number } {
  return { cap: b.cap, items: { ...b.items }, total: b.total };
}

function deserializeEntity(s: SerializedEntity): Entity {
  const e: Entity = { id: s.id, kind: s.kind as Entity["kind"], x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.researchTarget !== undefined) e.researchTarget = s.researchTarget;
  if (s.hp !== undefined) e.hp = s.hp;
  if (s.maxHp !== undefined) e.maxHp = s.maxHp;
  if (s.input) e.input = deserializeBuffer(s.input);
  if (s.machine) {
    const recipe = RECIPES[s.machine.recipeId];
    if (!recipe) throw new Error(`save: unknown recipe ${s.machine.recipeId}`);
    const crafter = new Crafter(recipe, s.machine.input.cap, s.machine.output.cap);
    crafter.crafting = s.machine.crafting;
    crafter.progressMs = s.machine.progressMs;
    crafter.input = deserializeBuffer(s.machine.input);
    crafter.output = deserializeBuffer(s.machine.output);
    e.machine = { crafter };
  }
  if (s.miner) e.miner = { output: deserializeBuffer(s.miner.output), rateAcc: s.miner.rateAcc };
  if (s.funding) e.funding = { input: deserializeBuffer(s.funding.input), fuelAcc: s.funding.fuelAcc };
  if (s.belt) e.belt = { dir: s.belt.dir, speed: s.belt.speed, items: s.belt.items.map((i) => ({ ...i })) };
  if (s.trader) e.trader = { dir: s.trader.dir, cooldownMs: s.trader.cooldownMs, busyMs: s.trader.busyMs };
  if (s.bro) e.bro = { type: s.bro.type, atkCdMs: s.bro.atkCdMs, xf: s.bro.xf, yf: s.bro.yf };
  if (s.tower) e.tower = { atkCdMs: s.tower.atkCdMs };
  if (s.roadshow) e.roadshow = { progress: s.roadshow.progress };
  return e;
}

export function serializeWorld(w: World, mapOpts: MapGenOpts): string {
  const save: SaveFormat = {
    v: 1,
    map: { ...mapOpts },
    world: {
      nextId: w.nextId,
      capital: w.capital,
      timeMs: w.timeMs,
      totals: { ...w.totals },
      tech: { ...w.tech },
      researched: [...w.researched],
      researchTarget: w.researchTarget,
      researchPoints: w.researchPoints,
      impact: Array.from(w.impact),
      impactW: w.impactW,
      impactH: w.impactH,
      evolution: w.evolution,
      hired: w.hired,
      state: w.state,
      marginCallMs: w.marginCallMs,
      broSpawnTimerMs: w.broSpawnTimerMs,
      hqId: w.hqId,
      rngState: w.rng.state(),
    },
    entities: [...w.entities.values()].map(serializeEntity),
  };
  return JSON.stringify(save);
}

/** Rebuild a world from a serialized save; throws on corrupt/incompatible data. */
export function deserializeWorld(json: string): { world: World; map: TileMap; feeds: FeedPatch[] } {
  const save = JSON.parse(json) as SaveFormat;
  if (save.v !== 1) throw new Error(`save: unsupported version ${save.v}`);
  const { map, feeds } = generateMap(save.map);
  const w = new World({ map, feeds, seed: save.map.seed, rng: new Rng(save.map.seed, save.world.rngState) });
  w.nextId = save.world.nextId;
  w.capital = save.world.capital;
  w.timeMs = save.world.timeMs;
  w.totals = { ...save.world.totals } as World["totals"];
  w.tech = { ...save.world.tech } as unknown as World["tech"];
  w.researched = new Set(save.world.researched);
  w.researchTarget = save.world.researchTarget;
  w.researchPoints = save.world.researchPoints;
  w.impact = Float32Array.from(save.world.impact);
  w.impactW = save.world.impactW;
  w.impactH = save.world.impactH;
  w.evolution = save.world.evolution;
  w.hired = save.world.hired;
  w.state = save.world.state;
  w.marginCallMs = save.world.marginCallMs;
  w.broSpawnTimerMs = save.world.broSpawnTimerMs;
  w.hqId = save.world.hqId;
  for (const s of save.entities) {
    const e = deserializeEntity(s);
    w.entities.set(e.id, e);
  }
  return { world: w, map, feeds };
}

/** localStorage-backed autosave helpers (browser only). */
export function saveToStorage(json: string): void {
  try {
    localStorage.setItem(SAVE_KEY, json);
  } catch {
    // storage full/unavailable — autosave is best-effort
  }
}

export function loadFromStorage(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function clearStorageSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // noop
  }
}

/** Tile map regenerated from a save; used by tests/load-time validation. */
export function mapFromSave(json: string): TileMap {
  const save = JSON.parse(json) as SaveFormat;
  return generateMap(save.map).map;
}
