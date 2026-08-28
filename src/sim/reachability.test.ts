import { describe, expect, it } from "vitest";
import { generateMap, type FeedPatch } from "../world/mapgen";
import { tickWorld } from "./update";
import { bufferAdd, inputBufferOf } from "./production";
import {
  BRO_STATS,
  ALWAYS_ON,
  COSTS,
  DX,
  DY,
  HIRE_QUOTA,
  SIZES,
  POWER_RANGE,
  ROADSHOW_ALPHA_NEEDED,
  STARTING_CAPITAL,
  World,
  burnOf,
  type Dir,
  type Entity,
  type EntityKind,
} from "./world";

/**
 * The win-reachability arbiter. Everything here goes through the player's own
 * verbs — placeEntity, tape, hireBro, setResearchTarget — never by poking
 * buffers or handing out capital. If this passes, the game can be won; if it
 * fails, the economy is wrong rather than the test.
 */

const DT = 1000 / 30;
const DIRS: Dir[] = ["E", "S", "W", "N"];
/** The player's map, exactly as main.ts generates it. */
const MAP_OPTS = { width: 256, height: 256, seed: 11, startClearRadius: 24, poolClusters: 40 };
/** Cash kept back for construction before the fund spends on headcount. */
const RESERVE = 25_000;

function makeWorld(startCapital = STARTING_CAPITAL): World {
  const { map, feeds } = generateMap(MAP_OPTS);
  const w = new World({ map, feeds, seed: MAP_OPTS.seed, startCapital });
  w.spawnHQ();
  return w;
}

interface Tile {
  x: number;
  y: number;
}

const costOf = (kinds: Iterable<EntityKind>): number => {
  let total = 0;
  for (const k of kinds) total += COSTS[k];
  return total;
};

const member = (chain: Entity[], kind: EntityKind): Entity => {
  const e = chain.find((c) => c.kind === kind);
  if (!e) throw new Error(`line has no ${kind}`);
  return e;
};

const headquarters = (w: World): Entity => {
  const e = [...w.entities.values()].find((c) => c.kind === "hq");
  if (!e) throw new Error("no headquarters");
  return e;
};

/** The free tile just outside `e` on side `d`. */
function sideTile(e: Entity, d: Dir): Tile {
  return {
    x: d === "E" ? e.x + e.w : d === "W" ? e.x - 1 : e.x,
    y: d === "S" ? e.y + e.h : d === "N" ? e.y - 1 : e.y,
  };
}

/** Free tape run from `start` in `d` whose head lands inside `to`. */
function tapeRun(w: World, start: Tile, d: Dir, to: Entity, limit = 24): Tile[] | null {
  const path: Tile[] = [];
  let { x: cx, y: cy } = start;
  for (let step = 0; step < limit; step++) {
    if (to.x <= cx && cx < to.x + to.w && to.y <= cy && cy < to.y + to.h) return path.length > 0 ? path : null;
    if (w.canPlace("belt", cx, cy) !== null) return null;
    path.push({ x: cx, y: cy });
    cx += DX[d];
    cy += DY[d];
  }
  return null;
}

function layTape(w: World, path: Tile[], d: Dir): void {
  for (const p of path) {
    const belt = w.placeEntity("belt", p.x, p.y);
    if (!belt) throw new Error(`tape gap closed at ${p.x},${p.y}`);
    belt.belt!.dir = d;
  }
}

/** Tape between two machines: straight out of a side, or with one bend. */
function tryWire(w: World, from: Entity, to: Entity): boolean {
  for (const d of DIRS) {
    const path = tapeRun(w, sideTile(from, d), d, to);
    if (path) {
      layTape(w, path, d);
      return true;
    }
  }
  for (const d1 of DIRS) {
    const start = sideTile(from, d1);
    for (const d2 of DIRS) {
      if (d1 === d2 || (DX[d1] === -DX[d2] && DY[d1] === -DY[d2])) continue;
      for (let k = 1; k <= 6; k++) {
        const leg1: Tile[] = [];
        let blocked = false;
        for (let i = 0; i < k; i++) {
          const t = { x: start.x + DX[d1] * i, y: start.y + DY[d1] * i };
          if (w.canPlace("belt", t.x, t.y) !== null) {
            blocked = true;
            break;
          }
          leg1.push(t);
        }
        if (blocked) break;
        const last = leg1[k - 1]!;
        const leg2 = tapeRun(w, { x: last.x + DX[d1], y: last.y + DY[d1] }, d2, to);
        if (!leg2) continue;
        layTape(w, leg1, d1);
        layTape(w, leg2, d2);
        return true;
      }
    }
  }
  return false;
}

function wire(w: World, from: Entity, to: Entity): void {
  if (!tryWire(w, from, to)) {
    throw new Error(`cannot wire ${from.kind}@${from.x},${from.y} → ${to.kind}@${to.x},${to.y}`);
  }
}

/**
 * Every legal miner corner, richest first. Data is the scarcest input in the
 * game: patches never regenerate, so this list is a fund's lifetime supply.
 */
function minerSpots(feeds: FeedPatch[]): Array<Tile & { richness: number }> {
  const out: Array<Tile & { richness: number }> = [];
  for (const f of feeds) {
    for (let y = f.y; y + SIZES.miner <= f.y + f.h; y++) {
      for (let x = f.x; x + SIZES.miner <= f.x + f.w; x++) out.push({ x, y, richness: f.richness });
    }
  }
  return out.sort((a, b) => b.richness - a.richness || a.y - b.y || a.x - b.x);
}

/** A chain's footprint split the way the sim cares about it: pads and tape. */
type Plan = { machines: Tile[]; belts: Tile[] };

/**
 * Slots for a west→east chain from `s`, one tape tile between stages, or null
 * when ground blocks it. Every stage and every gap is checked before anything
 * is placed, so a rejected probe spends nothing.
 */
function planChain(w: World, s: Tile, kinds: EntityKind[]): Plan | null {
  const machines: Tile[] = [];
  const belts: Tile[] = [];
  let cx = s.x;
  for (let j = 0; j < kinds.length; j++) {
    const kind = kinds[j]!;
    if (w.canPlace(kind, cx, s.y) !== null) return null;
    machines.push({ x: cx, y: s.y });
    cx += SIZES[kind];
    if (j + 1 < kinds.length) {
      if (w.canPlace("belt", cx, s.y) !== null) return null;
      belts.push({ x: cx, y: s.y });
      cx += 1;
    }
  }
  return { machines, belts };
}

/** Whether any tile orthogonally beside `t` is an entity of a given sort. */
function beside(w: World, t: Tile, kind: "belt" | "any", except?: Entity): Entity | null {
  const around: ReadonlyArray<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of around) {
    const e = w.entityAt(t.x + dx, t.y + dy);
    if (!e || e === except) continue;
    if (kind === "belt" && e.kind !== "belt") continue;
    return e;
  }
  return null;
}

/**
 * Tape is the exclusive resource, not ground. A belt tile touching two
 * machines serves both, and a machine pushes into any lane that has room, so
 * one shared tile lets a funding desk drink the clean data an analytics was
 * queued to receive — the plant then runs at a tenth of the capacity the
 * books claim (§5.2). Machines may touch each other freely: with no belt
 * between them nothing moves, and forbidding it made three-machine lines
 * unplaceable on this map, which is what really capped a fund at seventeen
 * lines and kept the alpha tier unbuilt.
 */
function exclusive(w: World, plan: Plan): boolean {
  for (const b of plan.belts) if (beside(w, b, "any")) return false;
  for (const m of plan.machines) if (beside(w, m, "belt")) return false;
  return true;
}

/** Place a planned chain and wire it stage to stage. */
function buildChain(w: World, s: Tile, kinds: EntityKind[]): Entity[] | null {
  const plan = planChain(w, s, kinds);
  if (!plan || !exclusive(w, plan)) return null;
  const chain = plan.machines.map((p, i) => w.placeEntity(kinds[i]!, p.x, p.y)!);
  for (let k = 0; k + 1 < chain.length; k++) wire(w, chain[k]!, chain[k + 1]!);
  return chain;
}

/** The richest corner whose ground carries the chain with lanes to itself. */
function buildLine(w: World, spots: Tile[], kinds: EntityKind[]): Entity[] | null {
  for (let i = 0; i < spots.length; i++) {
    const chain = buildChain(w, spots[i]!, kinds);
    if (!chain) continue;
    spots.splice(i, 1);
    return chain;
  }
  return null;
}

/**
 * The desk needs alpha and signals, which no single line carries, so the lab
 * is two chains ending at the same x: signals into the desk, alpha up from
 * the factory below it (§5.5). Two free corners sharing a column, far enough
 * apart that both chains fit with a tape row between.
 */
function labPair(
  w: World,
  spots: Tile[],
  upper: EntityKind[],
  lower: EntityKind[],
): [Tile, Tile] | null {
  for (const a of spots) {
    if (!planChain(w, a, upper)) continue;
    for (const b of spots) {
      const dy = b.y - a.y;
      if (a.x !== b.x || dy < 5 || dy > 9) continue;
      if (planChain(w, b, lower)) return [a, b];
    }
  }
  return null;
}

/**
 * A compliance tower one tape tile off the printer, where the ammo is.
 * Towers need no feed, so they take any free side.
 */
function buildTower(w: World, printer: Entity, side: Dir, slot: number): Entity | null {
  const anchor: Tile =
    side === "E"
      ? { x: printer.x + printer.w + 1 + slot * 4, y: printer.y }
      : side === "W"
        ? { x: printer.x - SIZES.tower - 1 - slot * 4, y: printer.y }
        : side === "S"
          ? { x: printer.x + slot * 4, y: printer.y + printer.h + 1 }
          : { x: printer.x + slot * 4, y: printer.y - SIZES.tower - 1 };
  const built = buildChain(w, anchor, ["tower"]);
  if (!built) return null;
  const tower = built[0]!;
  if (tryWire(w, printer, tower)) return tower;
  w.removeEntity(tower.id);
  return null;
}

const NEEDS_POWER: Partial<Record<EntityKind, true>> = {
  miner: true,
  cleaner: true,
  analytics: true,
  factory: true,
  printer: true,
  research: true,
  tower: true,
  roadshow: true,
};

/** Manhattan gap from a tile to an entity rect (0 when it touches). */
function tileGap(x: number, y: number, r: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(r.x - x, x - (r.x + r.w - 1));
  const dy = Math.max(r.y - y, y - (r.y + r.h - 1));
  return dx + dy;
}

/**
 * Bring one dark machine onto the grid (§5.4): a treasury vault where there
 * is floor in range, otherwise a line of comms relays hopped outward from the
 * nearest energized machine — relays tolerate the feeds beneath a patch,
 * vaults do not, which is exactly why relays exist.
 */
function powerOne(w: World, dark: Entity): boolean {
  for (let r = 1; r <= POWER_RANGE; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > POWER_RANGE) continue;
        if (w.placeEntity("vault", dark.x + dx, dark.y + dy)) return true;
      }
    }
  }
  // No floor for a vault: hop a comms-relay line from the nearest energized
  // machine, routing around whatever is already standing there.
  let anchor: Entity | null = null;
  let best = Infinity;
  for (const e of w.entities.values()) {
    if (e.kind !== "vault" && e.kind !== "funding" && e.kind !== "link") continue;
    if (!w.powered.has(e.id)) continue;
    const g = tileGap(dark.x, dark.y, e);
    if (g < best) { best = g; anchor = e; }
  }
  if (!anchor) return false;
  let ax = anchor.x;
  let ay = anchor.y;
  for (let hop = 0; hop < 64; hop++) {
    const here = tileGap(ax, ay, dark);
    if (here <= POWER_RANGE) return true;
    const step = POWER_RANGE - 1;
    const gx = ax + Math.sign(dark.x - ax) * Math.min(Math.abs(dark.x - ax), step);
    const gy = ay + Math.sign(dark.y - ay) * Math.min(Math.abs(dark.y - ay), step);
    let moved = false;
    for (let r = 0; r <= 4 && !moved; r++) {
      for (let dy = -r; dy <= r && !moved; dy++) {
        for (let dx = -r; dx <= r && !moved; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== r) continue;
          const nx = gx + dx;
          const ny = gy + dy;
          if (tileGap(nx, ny, dark) >= here) continue; // never walk away
          const link = w.placeEntity("link", nx, ny);
          if (!link) continue;
          w.recomputePower();
          if (!w.powered.has(link.id)) {
            w.removeEntity(link.id);
            continue;
          }
          ax = nx;
          ay = ny;
          moved = true;
        }
      }
    }
    if (!moved) return false;
  }
  return false;
}

/**
 * Power the base the way a player would: vaults first, relays second.
 *
 * `tolerant` is for the repair sweep during a raid: a bro standing on the
 * only corridor makes the machines behind it unreachable, and that must not
 * black out every other dark machine in the base — the reachable ones still
 * get wired and the stuck one is retried next second. Build-time calls stay
 * strict: fresh ground has no excuse for being dark.
 */
function powerEverything(w: World, tolerant = false): void {
  for (let n = 0; n < 400; n++) {
    w.recomputePower();
    const dark = [...w.entities.values()].filter((e) => NEEDS_POWER[e.kind] && !w.powered.has(e.id));
    if (dark.length === 0) return;
    let wired = false;
    for (const e of dark) {
      if (powerOne(w, e)) wired = true;
    }
    if (!wired) break;
  }
  w.recomputePower();
  const still = [...w.entities.values()].filter((e) => NEEDS_POWER[e.kind] && !w.powered.has(e.id));
  if (tolerant || still.length === 0) return;
  throw new Error(
    `cannot power (${(w.timeMs / 1000).toFixed(0)}s, cap ${Math.round(w.capital)}, ` +
      `${w.entities.size} entities): ${still.map((e) => `${e.kind}@${e.x},${e.y}`).join(" ")}`,
  );
}

const LAB: EntityKind[] = ["miner", "cleaner", "analytics", "research"];
const LAB_FEED: EntityKind[] = ["miner", "cleaner", "analytics", "factory"];
const AMMO: EntityKind[] = ["miner", "cleaner", "printer"];
const TOWER_SIDES: Dir[] = ["E", "W", "S", "N"];

/**
 * Build order, gated on the tech that makes each output sellable (§5.6): a
 * strategy factory built before FUEL TIER II burns cash making alpha that
 * nobody is allowed to buy yet.
 *
 * The alpha cell is the four-stage feed chain plus a desk belted off the
 * factory (`deskFrom`), not a five-stage line: fifteen tiles of clear shelf
 * east of a patch corner is ground this map does not have, which made the
 * rich tier unbuildable and left funds selling signals forever (§5.2).
 *
 * The counts are a ground budget, not a wish list. This planner lays one
 * straight row per chain and refuses any belt that would touch another entity,
 * so it claims patch corners fast and never reclaims them. The measured run
 * filled every corner it could reach (21 miners down) inside four minutes —
 * three minutes before FUEL TIER II unlocks — after which it logged
 * `no ground left` for the alpha chain and could never satisfy its own gate of
 * three factories. Over-building the cheap rung costs the ground for the rich
 * one, so the cheap rungs are capped here.
 */
const PROJECTS: Array<{
  kinds: EntityKind[];
  needsTier: number;
  count: number;
  deskFrom?: EntityKind;
}> = [
  { kinds: ["miner", "cleaner", "funding"], needsTier: 0, count: 5 },
  { kinds: ["miner", "cleaner", "analytics", "funding"], needsTier: 1, count: 4 },
  { kinds: LAB_FEED, needsTier: 2, count: 8, deskFrom: "factory" },
];

/** Two tiles off `e` on `side` — room for the belt a wire needs. */
function besideTile(e: Entity, side: Dir): Tile {
  return side === "E"
    ? { x: e.x + e.w + 2, y: e.y }
    : side === "W"
      ? { x: e.x - 3, y: e.y }
      : side === "N"
        ? { x: e.x, y: e.y - 3 }
        : { x: e.x, y: e.y + e.h + 2 };
}

/**
 * Stand a funding desk beside a machine and belt it in, on the first side
 * with ground and a straight lane. A producer whose product has no buyer
 * jams its own line, so the desk is part of the line, not an afterthought.
 */
function attachDesk(w: World, src: Entity): Entity | null {
  for (const side of TOWER_SIDES) {
    const at = besideTile(src, side);
    if (beside(w, at, "belt", src)) continue;
    const desk = w.placeEntity("funding", at.x, at.y);
    if (!desk) continue;
    try {
      wire(w, src, desk);
      return desk;
    } catch {
      // No straight lane that way; the desk was never placed, so nothing to
      // unwind and the next side gets its turn.
    }
  }
  return null;
}

/**
 * Bulldoze one producer's output lane — the tape and the desk at its head —
 * and report whether that is what was standing there. Delivery is geometric:
 * a machine pushes into any adjacent belt that leads away from it, so a lane
 * whose buyer is gone keeps eating output until it is full and then jams the
 * line behind it. Re-pointing a line at a new sink means taking the old lane
 * down with the desk, not just the desk.
 */
function clearOutputLane(w: World, src: Entity): boolean {
  for (const d of DIRS) {
    const t = sideTile(src, d);
    let cur = w.entityAt(t.x, t.y);
    if (!cur?.belt) continue;
    const lane: Entity[] = [];
    for (let steps = 0; cur?.belt && steps < 32; steps++) {
      lane.push(cur);
      const nd = cur.belt.dir;
      cur = w.entityAt(cur.x + DX[nd], cur.y + DY[nd]);
    }
    if (cur?.kind !== "funding") continue;
    w.removeEntity(cur.id);
    for (const b of lane) w.removeEntity(b.id);
    return true;
  }
  return false;
}

function census(w: World, kind: EntityKind): number {
  let n = 0;
  for (const e of w.entities.values()) if (e.kind === kind) n++;
  return n;
}

/** One line of state; it becomes the failure message, so it must be enough. */
function trace(w: World): string {
  const rs = [...w.entities.values()].find((e) => e.kind === "roadshow");
  const selling = [...w.entities.values()].filter((e) => e.funding?.selling).length;
  return (
    `state=${w.state} reason=${w.lossReason} at ${(w.timeMs / 60_000).toFixed(1)}m ` +
    `hired=${w.hired}/${HIRE_QUOTA} cap=${Math.round(w.capital)} demand=${Math.round(w.demandPerSec)} ` +
    `tier=${w.tech.fuelTier} done=[${[...w.researched]}] pts=${w.researchPoints} ` +
    `min=${census(w, "miner")} cln=${census(w, "cleaner")} ana=${census(w, "analytics")} ` +
    `fac=${census(w, "factory")} desk=${census(w, "funding")}/${selling} twr=${census(w, "tower")} ` +
    `bro=${census(w, "bro")} waves=${w.waves} made=${JSON.stringify(w.totals)} ` +
    `ipo=${rs ? `${Math.floor(rs.roadshow!.progress)}/${ROADSHOW_ALPHA_NEEDED} buf=${rs.input?.total ?? 0}` : "none"}`
  );
}

describe("win reachability", () => {
  it("the map carries enough data to build a winning fund", () => {
    const { feeds } = generateMap(MAP_OPTS);
    // One miner per corner is optimistic (machines need floor east of the
    // patch), but it is the ceiling the build order below assumes.
    expect(minerSpots(feeds).length).toBeGreaterThan(40);
  });

  /**
   * Balance pass evidence (§11): each rung of the fuel ladder must pay the
   * margin the price table claims, because the 250-head quota is priced
   * against it. Ten lines of each shape, warm, then one measured minute.
   */
  const RUNGS: Array<{
    kinds: EntityKind[];
    tier: number;
    net: [number, number];
    made: keyof World["totals"];
  }> = [
    { kinds: ["miner", "cleaner", "funding"], tier: 0, net: [2_000, 2_600], made: "clean" },
    { kinds: ["miner", "cleaner", "analytics", "funding"], tier: 1, net: [3_300, 4_300], made: "signal" },
  ];
  for (const rung of RUNGS) {
    const label = rung.tier === 0 ? "clean" : "signal";
    it(`ten ${label} lines carry the fund's margin`, () => {
      const w = makeWorld();
      w.tech.fuelTier = rung.tier;
      // Ten of these shapes cost more than the opening bank; the fund is
      // funded so the test measures the rung, not the start. Kept under the
      // 2M vault ceiling so nothing clips the measured income.
      w.capital = 800_000;
      const spots = minerSpots(w.feeds);
      for (let n = 0; n < 10; n++) {
        expect(buildLine(w, spots, rung.kinds)).not.toBeNull();
      }
      powerEverything(w);
      for (let i = 0; i < 1_500; i++) tickWorld(w, DT); // 50 s warm-up
      const cap0 = w.capital;
      const made0 = w.totals[rung.made];
      for (let i = 0; i < 1_800; i++) tickWorld(w, DT); // 60 s measured
      const made = (w.totals[rung.made] - made0) / 60;
      expect(made, `${label}/s`).toBeGreaterThan(4.5);
      const net = (w.capital - cap0) / 60;
      expect(net, `net $/s on ten ${label} lines`).toBeGreaterThan(rung.net[0]);
      expect(net, `net $/s on ten ${label} lines`).toBeLessThan(rung.net[1]);
      expect(w.multiplier).toBe(1); // no brownout on a funded base
    });
  }

  /**
   * Plays the game the way DESIGN.md §8 intends: sell clean data, buy the
   * lab, climb the fuel ladder, keep the office defended, hire to the quota,
   * then take an alpha line off the market and point it at the roadshow.
   * Every rule below is a money rule the player can read off the panel — no
   * injected capital, no pumped belt speed, no preloaded win condition.
   */
  it("scripted play reaches the IPO inside the 50-minute window", () => {
    const w = makeWorld();
    // Corners nearest the office first, richest as the tie-break. Ordering by
    // richness alone scattered the plant across a 256×256 map: cells landed
    // beyond any power corridor and stayed dark — a desk with no power sells
    // nothing — and no turret covered them either. A fund builds where its
    // wire and its guns reach (§5.4, §5.7).
    const office0 = headquarters(w);
    const spots = minerSpots(w.feeds).sort(
      (a, b) =>
        Math.abs(a.x - office0.x) + Math.abs(a.y - office0.y) -
          (Math.abs(b.x - office0.x) + Math.abs(b.y - office0.y)) ||
        b.richness - a.richness ||
        a.y - b.y ||
        a.x - b.x,
    );
    // The route to the IPO in research terms: richer fuel (250 → 900 → 3.5k a
    // unit), comp discount because the 250-head quota is bought in comp
    // (§5.8), and tower damage because a turret that cannot kill a bro is a
    // 15k burn. Ordered so every `requires` is already done (§5.5).
    const TECHS = [
      "fuel-tier-1", "trader-speed-1", "analytics-speed-1", "fuel-tier-2",
      "tower-damage-1", "comp-discount-1", "factory-speed-1", "brief-efficiency",
      "tower-range-1", "comp-discount-2", "tower-damage-2", "vault-cap-1",
    ];
    // How many of each shape are still on the books, richest shape last.
    const wanted = PROJECTS.map((p) => p.count);
    const arc: string[] = [];
    let lines = 0;
    let labs = 0;
    let ammoDone = false;
    let legalPrinter: Entity | null = null;
    let ipo: Entity | null = null;
    /** 30 s bucket of the last IPO siting attempt, so a failure does not churn. */
    let ipoTriedAt = -1;
    /** Turrets kept standing at the office — a backbone, not the defence. */
    const GARRISON = 2;
    /** Research desks the fund runs; each is 0.125 points/s (§5.5). */
    const LABS = 3;
    /** Lab desk chain + its alpha feed: the fund's first big ticket. */
    const LAB_COST = costOf([...LAB, ...LAB_FEED]);

    /**
     * One lab pair = one research desk (0.125 points/s, §5.5) plus its own
     * alpha feed. A single desk cannot finish the tech route inside a run —
     * the route costs ~200 points, which is 25 minutes of one desk — so the
     * fund buys pairs the same way it buys production lines.
     */
    const buildLabPair = (): boolean => {
      const pair = labPair(w, spots, LAB, LAB_FEED);
      if (!pair) return false;
      const desk = buildChain(w, pair[0], LAB);
      const feed = buildChain(w, pair[1], LAB_FEED);
      if (!desk || !feed) return false;
      wire(w, member(feed, "factory"), member(desk, "research"));
      lines += 2;
      powerEverything(w);
      return true;
    };

    const lay = (kinds: EntityKind[]): Entity[] | null => {
      const chain = buildLine(w, spots, kinds);
      if (!chain) return null;
      lines++;
      powerEverything(w);
      return chain;
    };

    for (let i = 0; i < 90_000; i++) {
      tickWorld(w, DT);
      if (w.state !== "playing") break;
      if (i % 30 !== 0) continue; // one player action per sim second
      if (i % 1_800 === 0) arc.push(`  ${trace(w)}`);
      // Damage repair: a bro that eats a comms relay blacks out every machine
      // behind it, so the fund re-links power the way a player re-drags the
      // wire. On a timer and only out of free cash — re-splicing every second
      // meant buying a 2k relay on every tick of a raid, and the plant's whole
      // payroll went into copper (§5.4).
      if (i % 150 === 0 && w.capital > RESERVE) powerEverything(w, true);
      const tech = TECHS.find((id) => !w.researched.has(id));
      if (tech && w.researchTarget !== tech) w.setResearchTarget(tech);


      // The lab goes up on empty ground, before any sales line. A funding
      // desk at tier 1 happily buys signal, so if a sales desk is standing
      // next to the lab's analytics when the belt is laid, the desk sells the
      // desk's own ingredient and the research desk — which needs one alpha
      // AND one signal per craft — starves holding half a recipe. Building
      // the lab first also means the exclusivity rule protects its lanes:
      // later cells may not place a belt beside them (§5.5, §5.7).
      //
      // Each extra desk is another 0.125 points/s, and the route to the rich
      // fuels is ~200 points, so one desk cannot finish it inside a run.
      const labFund = labs === 0 ? LAB_COST : 0;
      const labPrice = LAB_COST + (labs === 0 ? RESERVE / 2 : 0);
      if (labs < LABS && lines >= 2 && w.capital > labPrice) {
        if (buildLabPair()) labs++;
        else if (labs === 0) throw new Error("no free column carries the lab pair");
        else labs = LABS; // no ground for a desk: stop budgeting for one
      }

      // Defence is payroll first: a bro is 4-50k once and then he is staff,
      // while a 15k turret is dismantled by the next wave. The office ring is
      // bought with comp, not with concrete (§5.7).
      const office = headquarters(w);
      for (const e of [...w.entities.values()]) {
        if (e.kind !== "bro") continue;
        const comp = BRO_STATS[e.bro!.type].comp;
        const atDoor = Math.max(Math.abs(e.x - office.x), Math.abs(e.y - office.y)) <= 14;
        if (atDoor && w.capital > comp + RESERVE) w.hireBro(e.id);
      }

      // A legal line plus a pair of turrets is the backbone. Past that the
      // turret loses the cost race against hiring, so the garrison stays small.
      if (!ammoDone && w.waves >= 1 && w.capital > costOf(AMMO) + COSTS.tower + RESERVE / 2) {
        const printer = lay(AMMO);
        if (!printer) throw new Error("no room for the legal line");
        legalPrinter = member(printer, "printer");
        ammoDone = true;
        powerEverything(w);
      }
      if (legalPrinter) {
        let standing = 0;
        for (const e of w.entities.values()) if (e.kind === "tower") standing++;
        while (standing < GARRISON && w.capital > COSTS.tower + RESERVE) {
          let built = false;
          for (const side of TOWER_SIDES) {
            for (const slot of [0, 1, 2]) {
              if (buildTower(w, legalPrinter, side, slot)) {
                built = true;
                break;
              }
            }
            if (built) break;
          }
          if (!built) break;
          standing++;
          powerEverything(w);
        }
      }

      // Expansion: the richest shape that is sellable at the current fuel
      // tier, affordable, and actually has ground under it — a patch corner
      // with no shelf for a long chain must fall back to a shorter line
      // rather than stall the fund (§5.2, §5.6).
      const priceOf = (pi: number): number => {
        const p = PROJECTS[pi]!;
        return costOf(p.kinds) + (p.deskFrom ? COSTS.funding : 0);
      };
      /**
       * A line is bought when the fund can pay for it and keep half a
       * reserve. The margin used to be a full reserve plus a 25 % premium,
       * which priced an alpha cell (89k) at 136k — a level the fund never
       * reached because bro-hiring ate every dollar above ~130k, so the rich
       * tier stayed unbuilt and the run could never sell alpha (§5.6).
       */
      const affordable = (pi: number): boolean => {
        const p = PROJECTS[pi]!;
        return wanted[pi]! > 0 && w.tech.fuelTier >= p.needsTier && w.capital > priceOf(pi) + RESERVE / 2;
      };
      for (let pi = PROJECTS.length - 1; pi >= 0; pi--) {
        if (!affordable(pi)) continue;
        const p = PROJECTS[pi]!;
        const chain = lay(p.kinds);
        if (!chain) {
          // `lay` tried every corner on the map, so this shape has no ground
          // left anywhere. Budgeting for it anyway is what froze a fund on
          // 25k: the build gate and the hire gate both waited on a line that
          // could never be built, and the bro wave arrived unhired (§5.2).
          wanted[pi] = 0;
          arc.push(`  no ground left for ${p.kinds.join("+")} at ${(w.timeMs / 60_000).toFixed(1)}m`);
          continue;
        }
        if (p.deskFrom) attachDesk(w, member(chain, p.deskFrom));
        wanted[pi]!--;
        break;
      }

      // Going public: the roadshow desk drinks 40 alpha over ~45 s (§5.10), so
      // it is only stood up once the fund runs three factories — one alpha line
      // cannot feed the IPO and the research desk at once, and a starved lab
      // stalls the whole ladder. The line that feeds it comes off the alpha
      // market first: delivery is geometric (a machine pushes into whichever
      // adjacent tape leads away from it), so the desk and its lane have to
      // come out before anything else can receive that factory's output.
      // Retried on a 30 s timer: a raid or a demolition can free the pad the
      // desk needs, and the attempt only tears down a line it can re-site.
      const factories = [...w.entities.values()].filter((e) => e.kind === "factory");
      const slot = Math.floor(w.timeMs / 30_000);
      if (
        !ipo &&
        ipoTriedAt !== slot &&
        w.tech.fuelTier >= 2 &&
        factories.length >= 3 &&
        w.capital > COSTS.roadshow + RESERVE
      ) {
        ipoTriedAt = slot;
        for (const fac of factories) {
          // Site the roadshow before anything is demolished. Bulldozing a
          // working line refunds only half of the desk and its tape, so a
          // failed attempt is a real loss and must not repeat on a timer.
          const spot = TOWER_SIDES.map((side) => besideTile(fac, side)).find(
            (at) => w.canPlace("roadshow", at.x, at.y) === null,
          );
          if (!spot || !clearOutputLane(w, fac)) continue;
          const desk = w.placeEntity("roadshow", spot.x, spot.y);
          if (!desk) continue;
          try {
            wire(w, fac, desk);
            ipo = desk;
          } catch {
            // No straight lane from that pad to the factory's output: the desk
            // comes back out and the line goes back on the market.
            w.removeEntity(desk.id);
            attachDesk(w, fac);
            continue;
          }
          if (ipo) break;
        }
        powerEverything(w, true);
      }

      // Headcount last, and only with money the next project does not need:
      // the float a fund spends on comp is the float that would have built the
      // plant paying for the hire after it (§5.8). The roadshow is a savings
      // goal as well — comp is optional, the IPO ticket is the win condition —
      // so until the desk is stood up the script will not spend below its
      // price (§5.10). Without that rule the plant is built, every dollar
      // after it goes into comp, and the fund is permanently $20k short of
      // going public.
      let nextLine = 0;
      for (let pi = 0; pi < PROJECTS.length; pi++) {
        if (wanted[pi]! > 0) nextLine = Math.min(nextLine || Infinity, priceOf(pi) + RESERVE / 2);
      }
      // Defence outranks the IPO ticket. A bro at the wall is bought off the
      // moment he is affordable (line above), so the fund keeps a war chest —
      // what the approaching wave costs to hire out — and saves for the
      // roadshow only with money above it. Saved without this: the plant gets
      // built, the cash goes into concrete and comp, and one raid walks into
      // an office the fund was $20k away from defending (§5.7).
      let warChest = 0;
      for (const e of w.entities.values()) {
        if (e.kind !== "bro") continue;
        if (Math.max(Math.abs(e.x - office.x), Math.abs(e.y - office.y)) > 40) continue;
        warChest += BRO_STATS[e.bro!.type].comp;
      }
      const ipoTicket = ipo ? 0 : COSTS.roadshow + RESERVE;
      const saving = Math.min(nextLine || Infinity, warChest + ipoTicket);

      for (const e of [...w.entities.values()]) {
        if (e.kind !== "bro") continue;
        // The quota IS the win condition's headcount (§5.8); comp paid past it
        // buys nothing but a bigger permanent burn, so the script stops hiring
        // once it is paid. A bro at the office wall is still bought above,
        // because losing the HQ ends the run on the spot.
        if (w.hired >= HIRE_QUOTA) break;
        if (w.capital < saving + BRO_STATS[e.bro!.type].comp) continue;
        w.hireBro(e.id);
      }
    }

    const final = trace(w);
    // FUEL TIER II is the rung the roadshow's alpha economy runs on, and the
    // win is that roadshow closing. Neither was reachable before the machine →
    // belt drain fix in `updateMachine`: a machine refused an item on its
    // output strand it in its own buffer for the rest of the run, so the
    // research desk's alpha feed jammed at the second tech and the alpha
    // economy never switched on anywhere on this map.
    const tiers = arc.map((l) => Number(/tier=(\d+)/.exec(l)?.[1] ?? 0));
    expect(tiers.length).toBeGreaterThan(0);
    expect(Math.max(...tiers)).toBeGreaterThanOrEqual(2);
    expect(final, final).toContain("state=won");
    expect(Number(final.match(/hired=(\d+)/)?.[1])).toBeGreaterThanOrEqual(HIRE_QUOTA);
  }, 180_000);

  /**
   * The failure mode the arc above spends its first seven minutes avoiding. A
   * research desk burns one alpha AND one signal per craft (§5.5), and alpha
   * only exists at the far end of a second chain. Feed a desk a perfect
   * signal supply and it still researches nothing — which is why a plant that
   * lets a sales desk buy the lab's signal, or never wires an alpha feed,
   * looks healthy on every other panel and never unlocks a richer fuel tier.
   */
  it("a research desk flooded with signal still researches nothing", () => {
    const w = makeWorld(1_000_000);
    const lab = buildLine(w, minerSpots(w.feeds), LAB);
    if (!lab) throw new Error("no free corner carries the lab chain");
    powerEverything(w);
    w.setResearchTarget("trader-speed-1");
    const desk = lab[3]!;
    for (let i = 0; i < 18_000; i++) tickWorld(w, DT); // ten sim minutes
    expect(w.powered.has(desk.id), "the desk must be powered for this to mean anything").toBe(true);
    expect(desk.machine!.crafter.input.items.signal ?? 0).toBeGreaterThan(0);
    expect(w.researched.size).toBe(0);
    expect(w.researchPoints).toBe(0);
  });

  it("bills exactly the powered machines that worked", () => {
    const w = makeWorld();
    const spots = minerSpots(w.feeds);
    expect(buildLine(w, spots, ["miner", "cleaner", "funding"])).not.toBeNull();
    expect(buildLine(w, spots, ["miner", "cleaner", "analytics", "funding"])).not.toBeNull();
    powerEverything(w);
    for (let i = 0; i < 300; i++) tickWorld(w, DT);
    let expected = 0;
    for (const e of w.entities.values()) {
      if (!w.powered.has(e.id)) continue;
      if (!ALWAYS_ON[e.kind] && !w.workedLastTick(e.id)) continue;
      expected += burnOf(e);
    }
    expect(expected).toBeGreaterThan(0); // the base has to actually run
    expect(w.demandPerSec).toBe(expected);
  });

  it("an idle machine costs nothing", () => {
    const w = makeWorld();
    expect(w.placeEntity("cleaner", headquarters(w).x + 6, headquarters(w).y + 6)).not.toBeNull();
    powerEverything(w);
    const before = w.capital;
    for (let i = 0; i < 1_800; i++) tickWorld(w, DT); // 60 s
    expect(w.demandPerSec).toBe(0);
    expect(w.capital).toBe(before);
  });

  it("a fuel tier never cuts off the fuel a desk is already selling", () => {
    const w = makeWorld();
    const line = buildLine(w, minerSpots(w.feeds), ["miner", "cleaner", "funding"]);
    expect(line).not.toBeNull();
    const desk = member(line!, "funding");
    powerEverything(w);
    w.tech.fuelTier = 2;
    const before = w.capital;
    for (let i = 0; i < 600; i++) tickWorld(w, DT);
    expect(desk.funding!.selling).toBe("clean");
    expect(w.capital).toBeGreaterThan(before);
  });

  it("a desk sells the richest fuel it is holding", () => {
    const w = makeWorld();
    const line = buildLine(w, minerSpots(w.feeds), ["miner", "cleaner", "funding"]);
    expect(line).not.toBeNull();
    const desk = member(line!, "funding");
    powerEverything(w);
    w.tech.fuelTier = 2;
    bufferAdd(desk.funding!.input, "clean", 4);
    bufferAdd(desk.funding!.input, "alpha", 4);
    tickWorld(w, DT);
    expect(desk.funding!.selling).toBe("alpha");
  });
});
