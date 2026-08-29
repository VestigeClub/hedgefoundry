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

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "WELCOME TO THE FUND",
    body: "Pan (drag / WASD), zoom (wheel). This is your Fund Office — it dies, you die. $400k to work with.",
    highlight: (w) => rectOf(hq(w)),
    done: (_w, ctx) => ctx.cameraMoved || ctx.elapsedMs >= 12_000,
  },
  {
    id: "miner",
    title: "FIRST EXTRACTION",
    body: "Press 1 — a Data Miner only mounts ON a Data Feed patch. Richness = rate multiplier (1.0–2.2×). Pick the best patch you can see.",
    highlight: (w) => rectOf(nearestFeed(w)),
    done: (w) => firstOf("miner")(w) !== null,
  },
  {
    id: "belt",
    title: "MOVE THE TAPE",
    body: "Press 0 — Ticker Tape carries Raw Tape to the next desk. Two lanes, flows one way. Belt = $800.",
    highlight: (w) => rectOf(firstOf("miner")(w)),
    done: (w) => beltAdjacentToMiner(w),
  },
  {
    id: "cleaner",
    title: "CLEAN IT",
    body: "Press 2 — Signal Cleaner turns Raw Tape into Clean Signal. Chain: miner → cleaner, belt between.",
    chips: ["TAPE", "CLEAN"],
    highlight: (w) => rectOf(firstOf("miner")(w)),
    done: (w) => firstOf("cleaner")(w) !== null,
  },
  {
    id: "funding",
    title: "FUND IT",
    body: "Press 7 — Funding Desk SELLS its fuel for Capital (clean $250, signal $900, alpha $3.5k). No fuel, no income.",
    chips: ["CLEAN", "$"],
    highlight: (w) => rectOf(firstOf("cleaner")(w)),
    done: (w) => firstOf("funding")(w) !== null,
  },
  {
    id: "income",
    title: "MONEY FLOWING",
    body: "First line live: miner→cleaner→desk ≈ +$220/s, pays itself off in ~110 s. This ladder is the whole game — scale it.",
    highlight: () => null,
    done: (w, ctx) => w.capital >= ctx.trough + 10_000,
  },
  {
    id: "defend",
    title: "DEFEND",
    body: "Press e — Finance Bros raid from the edges and hit your office. First wave imminent. Compliance Tower = $15k.",
    highlight: (w) => rectOf(hq(w)),
    done: (w) => firstOf("tower")(w) !== null,
  },
  {
    id: "hire",
    title: "HIRE",
    body: "Bros you don't kill, you hire: click one. Comp charged once ($4k–$50k). Quota: 250 heads to IPO.",
    highlight: (w) => rectOf(nearestBroOrHq(w)),
    done: (w) => w.hired >= 1,
  },
  {
    id: "research",
    title: "RESEARCH",
    body: "Press T — Research Desk (1 alpha + 1 signal per craft) points at a tech. Set a target; it's your ceiling, not money.",
    highlight: () => null,
    done: (w) => w.researchTarget !== null,
  },
  {
    id: "sendoff",
    title: "GO BIG",
    body: "You know the loop. Scale the ladder to alpha, build the Roadshow ($120k), hire the quota, IPO. X demolishes — half refund. This is not a step — it's a send-off.",
    highlight: () => null,
    done: (_w, ctx) => ctx.elapsedMs >= 8_000,
  },
];

const STARVED = "Starved line: an idle machine means the belt upstream is empty — check the miner.";
const BROWNOUT = "Brownout: build Funding Desks and Treasury Vaults (7/8) — power is capital.";

/** One-line contextual tip for the card's trouble slot, or null. */
export function troubleTip(w: World): string | null {
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
