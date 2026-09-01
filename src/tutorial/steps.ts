/**
 * Tutorial step definitions (DESIGN.md §8a). Pure predicates over World —
 * this file is the only coupling point between the tutorial and the sim.
 * Checked at ~10 Hz by the controller; predicates never allocate.
 */
import type { FeedPatch } from "../world/mapgen";
import type { World, Entity, EntityKind } from "../sim/world";

export interface TutorialRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per-update context the controller passes into step predicates. */
export interface StepCtx {
  cameraMoved: boolean;
  /** Time since the step became active, in ms. */
  elapsedMs: number;
  /** Lowest capital seen since the step became active (income step). */
  trough: number;
}

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** Optional chain diagram, rendered as inline chips in the card. */
  chips?: string[];
  /** What the ring points at; null = no ring. */
  highlight: (w: World) => TutorialRect | null;
  /** True when the player did the thing. */
  done: (w: World, ctx: StepCtx) => boolean;
}

function firstOf(kind: EntityKind): (w: World) => Entity | null {
  return (w: World) => {
    for (const e of w.entities.values()) if (e.kind === kind) return e;
    return null;
  };
}

function hq(w: World): Entity | null {
  return w.entities.get(w.hqId) ?? null;
}

function rectOf(e: { x: number; y: number; w: number; h: number } | null): TutorialRect | null {
  return e ? { x: e.x, y: e.y, w: e.w, h: e.h } : null;
}

/** Feed patch nearest `at` (fallback: map center when no HQ). */
function nearestFeed(w: World): FeedPatch | null {
  const base = hq(w);
  const bx = base ? base.x + base.w / 2 : w.map.w / 2;
  const by = base ? base.y + base.h / 2 : w.map.h / 2;
  let best: FeedPatch | null = null;
  let bd = Infinity;
  for (const f of w.feeds) {
    const d = (f.x - bx) * (f.x - bx) + (f.y - by) * (f.y - by);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

/** Nearest bro to the HQ, else the HQ itself (bro moves, the office doesn't). */
function nearestBroOrHq(w: World): Entity | null {
  const base = hq(w);
  const bx = base ? base.x + base.w / 2 : w.map.w / 2;
  const by = base ? base.y + base.h / 2 : w.map.h / 2;
  let best: Entity | null = null;
  let bd = Infinity;
  for (const e of w.entities.values()) {
    if (e.kind !== "bro") continue;
    const d = (e.x - bx) * (e.x - bx) + (e.y - by) * (e.y - by);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best ?? base;
}

/** A belt tile that touches (or sits in) a miner's footprint. */
function beltAdjacentToMiner(w: World): boolean {
  for (const b of w.entities.values()) {
    if (b.kind !== "belt") continue;
    for (const m of w.entities.values()) {
      if (m.kind !== "miner") continue;
      if (b.x >= m.x - 1 && b.x <= m.x + m.w && b.y >= m.y - 1 && b.y <= m.y + m.h) return true;
    }
  }
  return false;
}

/** Any belt touching a tower — the printer ammo feed the SUPPLY step teaches. */
function beltAdjacentToTower(w: World): boolean {
  for (const b of w.entities.values()) {
    if (b.kind !== "belt") continue;
    for (const t of w.entities.values()) {
      if (t.kind !== "tower") continue;
      if (b.x >= t.x - 1 && b.x <= t.x + t.w && b.y >= t.y - 1 && b.y <= t.y + t.h) return true;
    }
  }
  return false;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "THE FUND — YOUR GOAL",
    body: "Win: hire 250 Finance Bros and IPO. Lose: the bros overrun your Fund Office. Everything costs Capital, and buildings BURN capital every second — income must outpace the burn. Pan: drag / WASD. Zoom: wheel.",
    highlight: (w) => rectOf(hq(w)),
    done: (_w, ctx) => ctx.cameraMoved || ctx.elapsedMs >= 12_000,
  },
  {
    id: "miner",
    title: "STEP 1 — MINE THE TAPE",
    body: "Press 1, then click a glowing Data Feed patch (the ring). A Data Miner mines Raw Tape off it — the raw ore of this game. Richer patch = faster mining.",
    highlight: (w) => rectOf(nearestFeed(w)),
    done: (w) => firstOf("miner")(w) !== null,
  },
  {
    id: "belt",
    title: "STEP 2 — MOVE IT",
    body: "Press 0, then click tiles to lay Ticker Tape. Belts carry items ONE WAY along the arrows (press R to rotate). Lay one so its arrow points INTO the miner's output — tape rides the belt.",
    highlight: (w) => rectOf(firstOf("miner")(w)),
    done: (w) => beltAdjacentToMiner(w),
  },
  {
    id: "cleaner",
    title: "STEP 3 — PROCESS IT",
    body: "Press 2 — a Signal Cleaner eats Raw Tape and makes CLEAN SIGNAL ($250 each). Put it one belt downstream of the miner: miner → belt → cleaner. Machines only work when powered: every desk powers things within 7 tiles of itself.",
    chips: ["TAPE", "CLEAN"],
    highlight: (w) => rectOf(firstOf("miner")(w)),
    done: (w) => firstOf("cleaner")(w) !== null,
  },
  {
    id: "funding",
    title: "STEP 4 — SELL IT",
    body: "Press 7 — a Funding Desk SELLS fuel for capital: clean $250, signal $900, alpha $3.5k. Belt Clean into it, and keep it within 7 tiles of a desk or Vault ($8, 7/8) so the line stays powered. This is the money loop — scale it with more miner lines.",
    chips: ["CLEAN", "$"],
    highlight: (w) => rectOf(firstOf("cleaner")(w)),
    done: (w) => firstOf("funding")(w) !== null,
  },
  {
    id: "income",
    title: "STEP 5 — INCOME ONLINE",
    body: "First line live: miner → cleaner → desk ≈ +$220/s. Watch CAPITAL climb in the top right. The first Finance Bro reaches your office in about a minute — check the NEXT WAVE dial, and keep this card in view.",
    highlight: () => null,
    done: (w, ctx) => w.capital >= ctx.trough + 10_000,
  },
  {
    id: "defend",
    title: "STEP 6 — ARMS",
    body: "Press E, then click next to the Fund Office: a Compliance Tower ($15k) shoots bros with Legal Briefs and holds their aggro. It ships with 4 briefs — four shots, no more. It must sit within 7 tiles of a desk/Vault to have power.",
    highlight: (w) => rectOf(hq(w)),
    done: (w) => firstOf("tower")(w) !== null,
  },
  {
    id: "supply",
    title: "STEP 7 — AMMO",
    body: "An empty tower is a wall, not a gun — this is how funds die. Press 5: a Legal Printer ($12k) turns Clean + Signal into Legal Briefs. Belt the briefs INTO the tower. Watch the AMMO line in the tower's inspector.",
    chips: ["CLEAN", "SIGNAL", "BRIEFS", "TOWER"],
    highlight: (w) => rectOf(firstOf("tower")(w)),
    done: (w) => firstOf("printer")(w) !== null && beltAdjacentToTower(w),
  },
  {
    id: "hire",
    title: "STEP 8 — HIRE",
    body: "Bros you don't kill, you hire: click one, then press HIRE in its panel. Comp is charged once ($4k–$50k) and hired bros work your machines for free. 250 heads = IPO. That's the win — everything you built feeds it.",
    highlight: (w) => rectOf(nearestBroOrHq(w)),
    done: (w) => w.hired >= 1,
  },
  {
    id: "research",
    title: "STEP 9 — UPGRADE",
    body: "Press T — a Research Desk ($20k, crafts 1 alpha + 1 signal) unlocks techs: belt/miner/cleaner speed, tower range and damage. Click a tech to set the target. Alpha is your ceiling — money is your speed.",
    highlight: () => null,
    done: (w) => w.researchTarget !== null,
  },
  {
    id: "sendoff",
    title: "RUN THE FUND",
    body: "The loop: mine → belt → process → sell → defend (tower + briefs) → hire → research. Waves arrive every 20 s and evolve. X demolishes (half refund), H help, Space pause, = speeds up. Scale the ladder to alpha, hire the quota, IPO.",
    highlight: () => null,
    done: (_w, ctx) => ctx.elapsedMs >= 8_000,
  },
];

const STARVED = "Starved line: an idle machine means the belt upstream is empty — check the miner.";
const BROWNOUT = "Brownout: build Funding Desks and Treasury Vaults (7/8) — power is capital.";

/** One-line contextual tip for the card's trouble slot, or null. */
export function troubleTip(w: World): string | null {
  for (const e of w.entities.values()) {
    if (e.kind === "tower" && w.powered.has(e.id) && (e.input?.items.brief ?? 0) === 0) {
      return "Tower out of ammo: belt Legal Briefs from a printer (5) into the tower.";
    }
  }
  if (w.multiplier < 1) return BROWNOUT;
  for (const e of w.entities.values()) {
    if (
      (e.kind === "cleaner" || e.kind === "analytics" || e.kind === "factory") &&
      w.powered.has(e.id) &&
      !w.workedLastTick(e.id)
    ) {
      return STARVED;
    }
  }
  return null;
}
