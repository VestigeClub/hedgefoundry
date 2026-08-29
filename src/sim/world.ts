import { Tile, type TileMap } from "../world/tilemap";
import type { FeedPatch } from "../world/mapgen";
import { computePowered, brownoutMultiplier } from "./power";
import type { Item } from "./items";
import { Rng } from "./rng";
import { createBuffer, type Buffer } from "./production";
import { Crafter } from "./production";
import { RECIPES } from "./recipes";
import { DEFAULT_TECH, type TechState } from "./research";
import { IMPACT_PER_CLOSE, MAX_OPEN_POSITIONS, POSITION_LIFE_MS, pnlOf, type ClosedPosition, type Position } from "./positions";

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
  | "trader"
  | "tower"
  | "hq"
  | "roadshow"
  | "trading"
  | "bro";

export type BroType = "analyst" | "trader" | "md" | "quant";

export const BRO_STATS: Record<BroType, { hp: number; dmg: number; speed: number; comp: number; label: string }> = {
  analyst: { hp: 20, dmg: 2, speed: 1.6, comp: 4_000, label: "ANALYST" },
  trader: { hp: 60, dmg: 6, speed: 1.1, comp: 10_000, label: "TRADER" },
  md: { hp: 200, dmg: 15, speed: 0.7, comp: 25_000, label: "MANAGING DIRECTOR" },
  quant: { hp: 400, dmg: 25, speed: 0.5, comp: 50_000, label: "QUANT" },
};

export interface BeltItem {
  item: Item;
  /** Position along the belt tile, 0 (tail) → 1 (head). */
  pos: number;
}

/** Transient render cues: the sim names the event, the renderer animates it.
 * (x, y) are tile coords; drained by main every frame and never saved. */
export type FxCueKind =
  | "place"
  | "demolish"
  | "hit"
  | "death"
  | "spawn"
  | "hqhit"
  | "wave"
  | "hire"
  | "sale"
  | "void"
  | "alarm";
export interface FxCue {
  kind: FxCueKind;
  x: number;
  y: number;
  /** Amount; per kind: $ (sale/hire), bro count (wave), cost (place). */
  v?: number;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  w: number;
  h: number;
  machine?: { crafter: Crafter };
  /** Captured research target while the desk crafts (research machines). */
  researchTarget?: string | null;
  miner?: { output: Buffer; rateAcc: number };
  funding?: {
    input: Buffer;
    selling: Item | null;
    /** Float-text throttle: $ accrued since the last "+$N" popped. Runtime only. */
    floatAcc?: number;
    floatAtMs?: number;
  };
  belt?: { dir: Dir; speed: number; items: BeltItem[]; jamMs?: number };
  trader?: { dir: Dir; cooldownMs: number; busyMs: number };
  /** Generic input buffer (tower ammo, roadshow alpha). */
  input?: Buffer;
  /** Combat hit points (machines, towers, HQ, roadshow, bros). */
  hp?: number;
  maxHp?: number;
  bro?: { type: BroType; atkCdMs: number; xf: number; yf: number };
  tower?: { atkCdMs: number };
  roadshow?: { progress: number };
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
  tower: 2,
  hq: 4,
  roadshow: 4,
  trading: 2,
  bro: 1,
};

/**
 * Build costs in capital (DESIGN.md §11). Sized so a starter line (miner +
 * tape + cleaner + funding) is ~1/4 of the opening reserve and a winning
 * production floor (~12 lines + defence + roadshow) fits under the cap.
 */
export const COSTS: Record<EntityKind, number> = {
  miner: 4_000,
  cleaner: 8_000,
  analytics: 20_000,
  factory: 45_000,
  printer: 12_000,
  research: 30_000,
  funding: 12_000,
  vault: 6_000,
  link: 2_000,
  belt: 800,
  trader: 4_000,
  tower: 15_000,
  hq: 0,
  roadshow: 120_000,
  trading: 30_000,
  bro: 0,
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
  tower: "COMPLIANCE TOWER",
  hq: "FUND OFFICE",
  roadshow: "ROADSHOW",
  trading: "TRADING DESK",
  bro: "FINANCE BRO",
};

/**
 * Opening reserve. Priced against a clean line (~26k: miner + cleaner + desk
 * + tape) and the lab pair (~139k): enough for a starter base plus the lab,
 * so the first real decision is whether to spend on production or on
 * research, and neither order is free (DESIGN.md §11).
 */
export const STARTING_CAPITAL = 400_000;
/** Hard ceiling; treasury vaults raise it by VAULT_CAPACITY each. */
export const BASE_CAPITAL_CAP = 2_000_000;
/** Capital headroom one treasury vault adds (DESIGN.md §5.4). */
export const VAULT_CAPACITY = 250_000;
export const POWER_RANGE = 7; // tiles, manhattan (DESIGN.md §5.4)
export const BROWN_OUT_BUFFER_SEC = 2;
export const HIRE_QUOTA = 250;
/**
 * Alpha a roadshow must burn to close the IPO. 40 units, delivered over
 * ~45 s — the finale should be a supply check, not a waiting room
 * (DESIGN.md §5.10).
 */
export const ROADSHOW_ALPHA_NEEDED = 40;
export const ROADSHOW_DELIVERY_PER_SEC = ROADSHOW_ALPHA_NEEDED / 45;
export const IMPACT_CELL = 4; // tiles per impact cell (64×64 on a 256 map)

/** Defence and the roadshow bill whether or not they act (DESIGN.md §5.4). */
export const ALWAYS_ON: Partial<Record<EntityKind, true>> = { tower: true, roadshow: true };

export interface WorldOpts {
  map: TileMap;
  feeds: FeedPatch[];
  seed: number;
  startCapital?: number;
  /** Threat-clock multiplier (class mode runs 2×): waves + evolution only. */
  pace?: number;
  rng?: Rng;
}

export class World {
  readonly pace: number;
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
  tech: TechState = { ...DEFAULT_TECH };
  researched = new Set<string>();
  researchTarget: string | null = null;
  researchPoints = 0;
  /** Items written off: surplus at a full terminal sink, and belt heads whose
   * lane had nowhere to go (update.ts, void rule). Reconciles `totals`. */
  writtenOff: Record<Item, number> = { tape: 0, clean: 0, signal: 0, alpha: 0, brief: 0 };
  lastWasteLogMs = 0;
  /** Coarse impact field (pollution analog): IMPACT_CELL² tiles per cell. */
  impact: Float32Array;
  impactW: number;
  impactH: number;
  evolution = 0;
  hired = 0;
  state: "playing" | "won" | "lost" = "playing";
  marginCallMs = 0;
  lossReason: "margin" | "hq" | null = null;
  brosKilled = 0;
  hiresByType: Record<BroType, number> = { analyst: 0, trader: 0, md: 0, quant: 0 };
  waves = 0;
  /** Last 200 notable events, newest last (end-game report). */
  timeline: Array<{ t: number; msg: string }> = [];
  /** 10 s samples for the end-game P&L curve. */
  capHistory: Array<{ t: number; capital: number; alpha: number }> = [];
  /** Entities that did work during the previous tick (drives the power bill). */
  working = new Set<number>();
  private workingPrev = new Set<number>();
  broSpawnTimerMs = 60_000;
  hqId = -1;
  /** Transient render cues; drained every frame, never saved, capped. */
  fx: FxCue[] = [];
  // Trading desk state (§5.10): live tape marks, open positions, history.
  prices: Record<string, number> = {};
  positions: Position[] = [];
  positionLog: ClosedPosition[] = [];
  nextPositionId = 1;
  // Scripted market events (§5.11): fire-once flags + active multipliers.
  events = { fired: {} as Record<string, boolean>, richnessMult: 1, richnessMultUntil: 0, fuelPriceMult: 1, fuelPriceMultUntil: 0 };

  constructor(opts: WorldOpts) {
    this.map = opts.map;
    this.feeds = opts.feeds;
    this.pace = opts.pace ?? 1;
    this.rng = opts.rng ?? new Rng(opts.seed);
    this.capital = opts.startCapital ?? STARTING_CAPITAL;
    this.impactW = Math.ceil(this.map.w / IMPACT_CELL);
    this.impactH = Math.ceil(this.map.h / IMPACT_CELL);
    this.impact = new Float32Array(this.impactW * this.impactH);
  }

  /** Base HP for a combat entity kind. */
  baseHp(kind: EntityKind): number {
    switch (kind) {
      case "hq":
        return 500;
      case "roadshow":
        return 300;
      case "tower":
        return 150;
      case "bro":
        return 0;
      default:
        return 100;
    }
  }

  impactAt(tx: number, ty: number): number {
    const cx = Math.floor(tx / IMPACT_CELL);
    const cy = Math.floor(ty / IMPACT_CELL);
    if (cx < 0 || cy < 0 || cx >= this.impactW || cy >= this.impactH) return 0;
    return this.impact[cy * this.impactW + cx] ?? 0;
  }

  totalImpact(): number {
    let sum = 0;
    for (let i = 0; i < this.impact.length; i++) sum += this.impact[i]!;
    return sum;
  }

  capitalCapacity(): number {
    let vaults = 0;
    for (const e of this.entities.values()) if (e.kind === "vault") vaults++;
    return BASE_CAPITAL_CAP + vaults * VAULT_CAPACITY + this.tech.vaultCapLvl * VAULT_CAPACITY;
  }

  /** Swap the working sets at the start of each tick (no allocation). */
  rollWorking(): void {
    const t = this.workingPrev;
    this.workingPrev = this.working;
    this.working = t;
    this.working.clear();
  }

  workedLastTick(id: number): boolean {
    return this.workingPrev.has(id);
  }

  logEvent(msg: string): void {
    this.timeline.push({ t: this.timeMs, msg });
    if (this.timeline.length > 200) this.timeline.shift();
  }

  /** Queue a render cue, capped: a bro massacre must never grow the queue. */
  cue(kind: FxCueKind, x: number, y: number, v?: number): void {
    if (this.fx.length < 128) this.fx.push({ kind, x, y, v });
  }

  /** Point the Research Desk at a tech; resets progress on change. Re-asking
   * for the current target is a no-op — banked points belong to that tech, and
   * the panel routes every click through here. */
  setResearchTarget(id: string | null): void {
    if (id === this.researchTarget) return;
    this.researchTarget = id;
    this.researchPoints = 0;
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
    if (kind === "trading" && this.tech.positions < 1) return "REQUIRES RESEARCH — POSITIONS DESK";
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
        e.machine = { crafter: new Crafter(RECIPES[recipeFor(kind)]!) };
        break;
      case "research":
        // Labs buffer a research run: 12 slots (6 crafts of alpha+signal).
        e.machine = { crafter: new Crafter(RECIPES.research!, 12, 4) };
        break;
      case "miner":
        e.miner = { output: createBuffer(4), rateAcc: 0 };
        break;
      case "funding":
        e.funding = { input: createBuffer(24), selling: null };
        break;
      case "belt":
        e.belt = { dir: "E", speed: 1.5, items: [] };
        break;
      case "trader":
        e.trader = { dir: "S", cooldownMs: 0, busyMs: 0 };
        break;
      case "tower":
        e.tower = { atkCdMs: 0 };
        e.input = createBuffer(8);
        break;
      case "roadshow":
        e.roadshow = { progress: 0 };
        e.input = createBuffer(16);
        break;
      case "hq":
        break;
    }
    if (kind !== "belt" && kind !== "link" && kind !== "trader") {
      e.hp = this.baseHp(kind);
      e.maxHp = e.hp;
    }
    this.capital -= COSTS[kind];
    this.entities.set(e.id, e);
    if (kind === "hq") this.hqId = e.id;
    this.cue("place", tx + s / 2, ty + s / 2, COSTS[kind]);
    return e;
  }

  /** Spawn the Fund Office at the map center (start of the game). */
  spawnHQ(): Entity {
    const cx = Math.floor(this.map.w / 2) - 2;
    const cy = Math.floor(this.map.h / 2) - 2;
    const hq = this.placeEntity("hq", cx, cy)!;
    return hq;
  }

  /** Spawn a finance bro at a passable tile (map edge caller). */
  spawnBro(type: BroType, tx: number, ty: number): Entity | null {
    if (this.state !== "playing") return null;
    const stats = BRO_STATS[type];
    const e: Entity = { id: this.nextId++, kind: "bro", x: tx, y: ty, w: 1, h: 1, hp: stats.hp, maxHp: stats.hp, bro: { type, atkCdMs: 0, xf: tx + 0.5, yf: ty + 0.5 } };
    this.entities.set(e.id, e);
    this.cue("spawn", tx + 0.5, ty + 0.5);
    return e;
  }

  /** Hire a bro: pay comp (discounted by tech), absorb into the fund. */
  hireBro(id: number): boolean {
    const e = this.entities.get(id);
    if (!e || e.kind !== "bro") return false;
    const stats = BRO_STATS[e.bro!.type];
    const cost = Math.round(stats.comp * (1 - 0.15 * this.tech.compDiscount));
    if (this.capital < cost) return false;
    this.capital -= cost;
    this.entities.delete(id);
    this.hired += 1;
    this.hiresByType[e.bro!.type] += 1;
    this.cue("hire", e.bro!.xf, e.bro!.yf, cost);
    if (this.hired % 50 === 0) this.logEvent(`HIRED ${this.hired}`);
    return true;
  }

  /** Demolish a non-HQ entity, refunding half the build cost. HQ is permanent. */
  removeEntity(id: number): boolean {
    const e = this.entities.get(id);
    if (!e || e.kind === "hq") return false;
    this.entities.delete(id);
    if (e.kind !== "bro") {
      this.capital = Math.min(this.capitalCapacity(), this.capital + Math.round(COSTS[e.kind] * 0.5));
    }
    this.cue("demolish", e.x + e.w / 2, e.y + e.h / 2);
    return true;
  }

  entityAt(tx: number, ty: number): Entity | null {
    for (const e of this.entities.values()) {
      if (tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h) return e;
    }
    return null;
  }

  /** Apply damage; removes destroyed entities. Returns true if it died. */
  damageEntity(id: number, dmg: number): boolean {
    const e = this.entities.get(id);
    if (!e || e.hp === undefined) return false;
    e.hp -= dmg;
    const isBro = e.kind === "bro";
    const cx = isBro ? e.bro!.xf : e.x + e.w / 2;
    const cy = isBro ? e.bro!.yf : e.y + e.h / 2;
    if (e.hp <= 0) {
      if (isBro) {
        this.brosKilled++;
        this.cue("death", cx, cy);
      } else {
        this.cue(e.kind === "hq" ? "hqhit" : "hit", cx, cy);
      }
      if (e.kind === "hq") {
        this.state = "lost";
        this.lossReason = "hq";
        this.logEvent("HQ OVERRUN");
      }
      this.entities.delete(id);
      return true;
    }
    this.cue("hit", cx, cy);
    return false;
  }

  // ── Trading desk (§5.10) ───────────────────────────────────────────────

  ingestPrice(symbol: string, px: number): void {
    this.prices[symbol] = px;
  }

  /** Take a capital position. Returns an error literal, or null on success. */
  openPosition(symbol: string, dir: "long" | "short", sizeUsd: number): string | null {
    const desk = [...this.entities.values()].find((e) => e.kind === "trading" && this.powered.has(e.id));
    if (!desk) return "NO TRADING DESK — BUILD AND POWER ONE";
    if (this.capital < sizeUsd) return "INSUFFICIENT CAPITAL";
    if (this.positions.length >= MAX_OPEN_POSITIONS) return "POSITION LIMIT — 5 OPEN";
    const px = this.prices[symbol];
    if (px === undefined || px <= 0) return "NO MARKET DATA";
    this.capital -= sizeUsd;
    const id = this.nextPositionId++;
    this.positions.push({
      id,
      symbol,
      dir,
      sizeUsd,
      entryPx: px,
      openedMs: this.timeMs,
      closesMs: this.timeMs + POSITION_LIFE_MS,
      deskId: desk.id,
    });
    this.logEvent(`OPEN ${dir.toUpperCase()} ${symbol} $${Math.round(sizeUsd)}`);
    return null;
  }

  /** Manual close at the current price. */
  closePosition(id: number): void {
    const i = this.positions.findIndex((p) => p.id === id);
    if (i === -1) return;
    const [p] = this.positions.splice(i, 1);
    this.settlePosition(p!);
  }

  /** Settle a position: margin + pnl back to capital, logged, +Impact. */
  settlePosition(p: Position): void {
    const px = this.prices[p.symbol];
    if (px === undefined) return;
    const pnl = pnlOf(p, px);
    this.capital = Math.min(this.capitalCapacity(), this.capital + p.sizeUsd + pnl);
    this.positionLog.push({ t: this.timeMs, symbol: p.symbol, dir: p.dir, sizeUsd: p.sizeUsd, pnl });
    if (this.positionLog.length > 100) this.positionLog.shift();
    const desk = this.entities.get(p.deskId);
    if (desk && this.powered.has(desk.id)) {
      this.working.add(desk.id);
      const cx = Math.floor((desk.x + desk.w / 2) / IMPACT_CELL);
      const cy = Math.floor((desk.y + desk.h / 2) / IMPACT_CELL);
      if (cx >= 0 && cy >= 0 && cx < this.impactW && cy < this.impactH) {
        this.impact[cy * this.impactW + cx] = (this.impact[cy * this.impactW + cx] ?? 0) + IMPACT_PER_CLOSE;
      }
      this.cue("sale", desk.x + 1, desk.y + 1, Math.round(pnl));
    }
  }
  /** Recompute the capital grid + brownout multiplier. */
  recomputePower(): void {
    const powerList: Array<{ id: number; kind: "source" | "link" | "consumer"; x: number; y: number; w: number; h: number }> = [];
    for (const e of this.entities.values()) {
      powerList.push({
        id: e.id,
        kind: e.kind === "vault" || e.kind === "funding" ? "source" : e.kind === "link" ? "link" : "consumer",
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
      });
    }
    this.powered = computePowered(powerList, POWER_RANGE);
    // Only entities that actually worked (plus always-on defence/roadshow)
    // are billed, so an idle base costs nothing.
    let demand = 0;
    for (const e of this.entities.values()) {
      if (!this.powered.has(e.id)) continue;
      if (!ALWAYS_ON[e.kind] && !this.workedLastTick(e.id)) continue;
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
    case "tower":
      return 25;
    case "roadshow":
      return 100;
    case "trading":
      return 10;
    default:
      return 0;
  }
}
