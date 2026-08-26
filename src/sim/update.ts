/**
 * World tick orchestration (DESIGN.md §5.3–5.4). Deterministic: entities are
 * iterated in insertion order; all randomness flows through World.rng.
 *
 * Order: power → demand/multiplier → funding (capital in) → burn (capital
 * out) → miners → machines → belts → traders.
 */
import type { Dir } from "./world";
import { DX, DY } from "./world";
import type { Entity } from "./world";
import type { World } from "./world";
import type { Item } from "./items";
import { bufferAdd, bufferTake, bufferCount } from "./production";

export function tickWorld(w: World, dtMs: number): void {
  w.timeMs += dtMs;
  w.recomputePower();

  // Funding desks produce capital first (consumes fuel).
  for (const e of w.entities.values()) {
    if (e.kind === "funding") updateFunding(w, e, dtMs);
  }

  // Burn: demand scales with the brownout multiplier.
  w.capital = Math.max(0, w.capital - w.demandPerSec * (dtMs / 1000) * w.multiplier);

  for (const e of w.entities.values()) {
    switch (e.kind) {
      case "miner":
        updateMiner(w, e, dtMs);
        break;
      case "cleaner":
      case "analytics":
      case "factory":
      case "printer":
      case "research":
        updateMachine(w, e, dtMs);
        break;
      case "belt":
        updateBelt(w, e, dtMs);
        break;
      case "trader":
        updateTrader(w, e, dtMs);
        break;
    }
  }
}

function updateFunding(w: World, e: Entity, dtMs: number): void {
  if (!w.powered.has(e.id)) return;
  const f = e.funding!;
  const want = 2 * (dtMs / 1000); // T0 fuel: clean data/s (research unlocks tiers, M4)
  const have = bufferCount(f.input, "clean");
  const availRatio = want > 0 ? Math.min(1, have / want) : 0;
  f.fuelAcc += want;
  const whole = Math.floor(f.fuelAcc);
  const taken = Math.min(whole, have);
  bufferTake(f.input, "clean", taken);
  f.fuelAcc -= taken;
  // Production runs continuously at the fuel-availability ratio; integer
  // consumption is just the bookkeeping rhythm.
  w.capital = Math.min(w.capitalCapacity(), w.capital + 40 * (dtMs / 1000) * availRatio);
}

function updateMiner(w: World, e: Entity, dtMs: number): void {
  if (!w.powered.has(e.id)) return;
  const m = e.miner!;
  const richness = w.feedAt(e.x, e.y)?.richness ?? 0;
  if (richness <= 0) return; // placed off-patch: idle (shouldn't happen; canPlace guards)
  m.rateAcc += 1 * richness * (dtMs / 1000) * w.multiplier;
  while (m.rateAcc >= 1) {
        if (bufferAdd(m.output, "tape", 1) === 0) break; // output full; hold the fraction
    m.rateAcc -= 1;
    w.totals.tape += 1;
    }
  // Push buffered tape onto adjacent belts; remainder waits for traders.
  while (bufferCount(m.output, "tape") > 0 && pushToAdjacentBelt(w, e, "tape")) {
    bufferTake(m.output, "tape", 1);
  }
}

function updateMachine(w: World, e: Entity, dtMs: number): void {
  const powered = w.powered.has(e.id);
  const mult = powered ? w.multiplier : 0;
  const crafter = e.machine!.crafter;
  const wasCrafting = crafter.crafting;
  crafter.tick(dtMs, mult);
  if (wasCrafting && !crafter.crafting) {
    // Craft completed: move outputs onto adjacent belts; remainder stays in
    // the output buffer for traders.
    for (const [item, qty] of Object.entries(crafter.recipe.out)) {
      w.totals[item as Item] += qty!;
      for (let i = 0; i < qty!; i++) {
        if (!pushToAdjacentBelt(w, e, item as Item)) break;
        bufferTake(crafter.output, item as Item, 1);
      }
    }
  }
}

const BELT_SPACING = 0.25;

/** Insert an item keeping the belt's ascending-pos order (head = last). */
function beltPush(e: Entity, item: Item, pos: number): void {
  const items = e.belt!.items;
  let i = 0;
  while (i < items.length && items[i]!.pos < pos) i++;
  items.splice(i, 0, { item, pos });
}

function updateBelt(w: World, e: Entity, dtMs: number): void {
  const b = e.belt!;
  const advance = b.speed * (dtMs / 1000);
  const items = b.items;
  // Front-to-back: front item (highest pos) tries to exit; others follow.
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    const ahead = i < items.length - 1 ? items[i + 1]! : null;
    const maxPos = ahead ? ahead.pos - BELT_SPACING : 1;
    const newPos = Math.min(it.pos + advance, Math.max(it.pos, maxPos));
    if (newPos >= 1 && !ahead) {
      if (tryBeltExit(w, e, it)) {
        items.pop();
        continue;
      }
      it.pos = 1 - 0.001;
    } else {
      it.pos = newPos;
    }
  }
}

/** Belt head → next belt or adjacent machine input. */
function tryBeltExit(w: World, e: Entity, it: { item: Item }): boolean {
  const dir = e.belt!.dir;
  const nx = e.x + DX[dir];
  const ny = e.y + DY[dir];
  const next = w.entityAt(nx, ny);
  if (!next) return false;
  if (next.kind === "belt") {
    if (beltTailRoom(next)) {
      beltPush(next, it.item, 0);
      return true;
    }
    return false;
  }
  if (next.machine) {
    return bufferAdd(next.machine.crafter.input, it.item, 1) > 0;
  }
  return false;
}

function beltTailRoom(e: Entity): boolean {
  const items = e.belt!.items;
  if (items.length === 0) return true;
  return items[0]!.pos >= BELT_SPACING;
}

/** Push one item from a machine/miner output onto any adjacent belt (E,S,W,N). Returns true if placed. */
function pushToAdjacentBelt(w: World, e: Entity, item: Item): boolean {
  const sides: Dir[] = ["E", "S", "W", "N"];
  for (const dir of sides) {
    // Adjacent tile on that side of the entity's rect (E: x+w, W: x-1, …).
    const nx = dir === "E" ? e.x + e.w : dir === "W" ? e.x - 1 : e.x;
    const ny = dir === "S" ? e.y + e.h : dir === "N" ? e.y - 1 : e.y;
    const b = w.entityAt(nx, ny);
    if (b?.kind === "belt" && beltTailRoom(b)) {
      beltPush(b, item, 0);
      return true;
    }
  }
  return false;
}

const TRADER_COOLDOWN_MS = 2_000;
const TRADER_SWING_MS = 350;
const PICKUP_POS = 0.75;

function updateTrader(w: World, e: Entity, dtMs: number): void {
  const t = e.trader!;
  if (t.busyMs > 0) {
    t.busyMs -= dtMs;
    return;
  }
  t.cooldownMs -= dtMs;
  if (t.cooldownMs > 0) return;

  // Destination: opposite side. Check capacity before taking anything.
  const dest = w.entityAt(e.x - DX[t.dir], e.y - DY[t.dir]);
  let destOk = false;
  if (dest) {
    if (dest.kind === "belt") destOk = beltTailRoom(dest);
    else if (dest.machine) destOk = dest.machine.crafter.input.total < dest.machine.crafter.input.cap;
  }
  if (!destOk) return;

  // Source: adjacent tile in the arm direction.
  const src = w.entityAt(e.x + DX[t.dir], e.y + DY[t.dir]);
  let item: Item | null = null;
  if (src) {
    if (src.kind === "belt") {
      const items = src.belt!.items;
      const front = items[items.length - 1];
      if (front && front.pos >= PICKUP_POS) {
        items.pop();
        item = front.item;
      }
    } else if (src.machine) {
      const out = src.machine.crafter.output;
      for (const [it, qty] of Object.entries(out.items)) {
        if (qty! > 0) {
          bufferTake(out, it as Item, 1);
          item = it as Item;
          break;
        }
      }
    }
  }
    if (!item) return;
  if (!dest) return;
  if (dest.kind === "belt") {
    beltPush(dest, item, 0);
  } else if (dest.machine) {
    bufferAdd(dest.machine.crafter.input, item, 1);
  }
  t.cooldownMs = TRADER_COOLDOWN_MS;
  t.busyMs = TRADER_SWING_MS;
}