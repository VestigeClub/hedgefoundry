import { Tile, type TileMap } from "../world/tilemap";
import type { FeedPatch } from "../world/mapgen";
import { computePowered, brownoutMultiplier } from "./power";
import type { Item } from "./items";
import { Rng } from "./rng";
import { createBuffer, type Buffer } from "./production";
import { Crafter } from "./production";
import { RECIPES } from "./recipes";

export type Dir = "N" | "E" | "S" | "W";
export const DIRS: readonly Dir[] = ["N", "E", "S", "W"];
export const DX: Record<Dir, number> = { N: 0, E: 1, S: 0, W: -1 };
export const DY: Record<Dir, number> = { N: -1, E: 0, S: 1, W: 0 };

export type EntityKind =
  | "miner"
  | "cleaner"
  | "analytics"
  | "factory"
  | "printer"
  | "research"
  | "funding"
  | "vault"
  | "link"
  | "belt"
  | "trader";

export interface BeltItem {
  item: Item;
  /** Position along the belt tile, 0 (tail) → 1 (head). */
  pos: number;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  w: number;
  h: number;
  machine?: { crafter: Crafter };
  miner?: { output: Buffer; rateAcc: number };
  funding?: { input: Buffer; fuelAcc: number };
  belt?: { dir: Dir; speed: number; items: BeltItem[] };
  trader?: { dir: Dir; cooldownMs: number; busyMs: number };
}

export const SIZES: Record<EntityKind, number> = {
  miner: 2,
  cleaner: 3,
  analytics: 3,
  factory: 3,
  printer: 2,
  research: 3,
  funding: 2,
  vault: 2,
  link: 1,
  belt: 1,
  trader: 1,
};

/** Build costs in capital (DESIGN.md §11). */
export const COSTS: Record<EntityKind, number> = {
  miner: 50_000,
  cleaner: 80_000,
  analytics: 120_000,
  factory: 250_000,
  printer: 90_000,
  research: 200_000,
  funding: 60_000,
  vault: 40_000,
  link: 2_000,
  belt: 10_000,
  trader: 15_000,
};

export const KIND_LABEL: Record<EntityKind, string> = {
  miner: "DATA MINER",
  cleaner: "SIGNAL CLEANER",
  analytics: "ANALYTICS ENGINE",
  factory: "STRATEGY FACTORY",
  printer: "LEGAL PRINTER",
  research: "RESEARCH DESK",
  funding: "FUNDING DESK",
  vault: "TREASURY VAULT",
  link: "TREASURY LINK",
  belt: "TICKER TAPE",
  trader: "TRADER",
};

export const BASE_CAPITAL_CAP = 1_000_000;
export const VAULT_CAPACITY = 50_000;
export const POWER_RANGE = 7; // tiles, manhattan (DESIGN.md §5.4)
export const BROWN_OUT_BUFFER_SEC = 2;

export interface WorldOpts {
  map: TileMap;
  feeds: FeedPatch[];
  seed: number;
  startCapital?: number;
  rng?: Rng;
}

export class World {
  map: TileMap;
  feeds: FeedPatch[];
  rng: Rng;
  entities = new Map<number, Entity>();
  nextId = 1;
  capital: number;
  timeMs = 0;
  powered = new Set<number>();
  multiplier = 1;
  demandPerSec = 0;
  totals: Record<Item, number> = { tape: 0, clean: 0, signal: 0, alpha: 0, brief: 0 };

  constructor(opts: WorldOpts) {
    this.map = opts.map;
    this.feeds = opts.feeds;
    this.rng = opts.rng ?? new Rng(opts.seed);
    this.capital = opts.startCapital ?? BASE_CAPITAL_CAP;
  }

  capitalCapacity(): number {
    let vaults = 0;
    for (const e of this.entities.values()) if (e.kind === "vault") vaults++;
    return BASE_CAPITAL_CAP + vaults * VAULT_CAPACITY;
  }

  feedAt(tx: number, ty: number): FeedPatch | null {
    for (const f of this.feeds) {
      if (tx >= f.x && tx < f.x + f.w && ty >= f.y && ty < f.y + f.h) return f;
    }
    return null;
  }

  /** Error message if (kind, tx, ty) cannot be placed, else null. */
  canPlace(kind: EntityKind, tx: number, ty: number): string | null {
    const s = SIZES[kind];
    if (tx < 0 || ty < 0 || tx + s > this.map.w || ty + s > this.map.h) return "OUT OF BOUNDS";
    // Machines sit on floor; miner is the exception (must sit on a feed);
    // belts/links/traders tolerate feeds beneath them.
    const needsFloor = kind !== "belt" && kind !== "link" && kind !== "trader" && kind !== "miner";
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        const t = this.map.get(tx + dx, ty + dy);
        if (needsFloor) {
          if (t !== Tile.Floor) return t === Tile.StalePool ? "BLOCKED BY STALE POOL" : "BLOCKED BY DATA FEED";
        } else if (!this.map.isPassable(tx + dx, ty + dy)) {
          return "BLOCKED BY STALE POOL";
        }
      }
    }
    for (const e of this.entities.values()) {
      if (tx < e.x + e.w && tx + s > e.x && ty < e.y + e.h && ty + s > e.y) return "OCCUPIED";
    }
    if (kind === "miner" && !this.feedAt(tx, ty)) return "NEEDS DATA FEED";
    if (this.capital < COSTS[kind]) return "INSUFFICIENT CAPITAL";
    return null;
  }

  /** Place an entity; returns it or null (see canPlace for the reason). */
  placeEntity(kind: EntityKind, tx: number, ty: number): Entity | null {
    if (this.canPlace(kind, tx, ty) !== null) return null;
    const s = SIZES[kind];
    const e: Entity = { id: this.nextId++, kind, x: tx, y: ty, w: s, h: s };
    switch (kind) {
      case "cleaner":
      case "analytics":
      case "factory":
      case "printer":
      case "research":
        e.machine = { crafter: new Crafter(RECIPES[recipeFor(kind)]!) };
        break;
      case "miner":
        e.miner = { output: createBuffer(4), rateAcc: 0 };
        break;
      case "funding":
        e.funding = { input: createBuffer(8), fuelAcc: 0 };
        break;
      case "belt":
        e.belt = { dir: "E", speed: 1.5, items: [] };
        break;
      case "trader":
        e.trader = { dir: "S", cooldownMs: 0, busyMs: 0 };
        break;
    }
    this.capital -= COSTS[kind];
    this.entities.set(e.id, e);
    return e;
  }

  removeEntity(id: number): void {
    this.entities.delete(id);
  }

  entityAt(tx: number, ty: number): Entity | null {
    for (const e of this.entities.values()) {
      if (tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h) return e;
    }
    return null;
  }

  /** Recompute the capital grid + brownout multiplier. */
  recomputePower(): void {
    const powerList = [];
    for (const e of this.entities.values()) {
      powerList.push({
        id: e.id,
        kind: e.kind === "vault" || e.kind === "funding" ? ("source" as const) : e.kind === "link" ? ("link" as const) : ("consumer" as const),
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
      });
    }
    this.powered = computePowered(powerList, POWER_RANGE);
    let demand = 0;
    for (const e of this.entities.values()) {
      if (!this.powered.has(e.id)) continue;
      demand += burnOf(e);
    }
    this.demandPerSec = demand;
    this.multiplier = brownoutMultiplier(this.capital, demand, BROWN_OUT_BUFFER_SEC);
  }
}

function recipeFor(kind: EntityKind): string {
  switch (kind) {
    case "cleaner":
      return "clean";
    case "analytics":
      return "signal";
    case "factory":
      return "alpha";
    case "printer":
      return "brief";
    case "research":
      return "research";
    default:
      throw new Error(`no recipe for ${kind}`);
  }
}

/** Base capital burn per second while active (DESIGN.md §5.4). */
export function burnOf(e: Entity): number {
  switch (e.kind) {
    case "miner":
      return 10;
    case "cleaner":
      return 20;
    case "analytics":
      return 30;
    case "factory":
      return 60;
    case "printer":
      return 15;
    case "research":
      return 40;
    default:
      return 0;
  }
}
