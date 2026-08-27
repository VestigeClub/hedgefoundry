import type { Item } from "./items";
import type { Recipe } from "./recipes";
import { sellableFuels } from "./recipes";
import type { Entity, EntityKind } from "./world";
import type { TechState } from "./research";
export type Kind = Item;

/** Item buffer with a total capacity cap. Overflow is dropped and counted. */
export interface Buffer {
  cap: number;
  items: Partial<Record<Item, number>>;
  total: number;
}

export function createBuffer(cap: number): Buffer {
  return { cap, items: {}, total: 0 };
}

export function bufferHas(buf: Buffer, item: Item, qty: number): boolean {
  return (buf.items[item] ?? 0) >= qty;
}

export function bufferAdd(buf: Buffer, item: Item, qty: number): number {
  const room = buf.cap - buf.total;
  const added = Math.min(room, qty);
  if (added > 0) {
    buf.items[item] = (buf.items[item] ?? 0) + added;
    buf.total += added;
  }
  return added;
}

export function bufferTake(buf: Buffer, item: Item, qty: number): number {
  const have = buf.items[item] ?? 0;
  const taken = Math.min(have, qty);
  if (taken > 0) {
    buf.items[item] = have - taken;
    buf.total -= taken;
    if (buf.items[item] === 0) delete buf.items[item];
  }
  return taken;
}

export function bufferCount(buf: Buffer, item: Item): number {
  return buf.items[item] ?? 0;
}

/**
 * One craft slot: consumes inputs at craft start, produces at completion.
 * `multiplier` (brownout) slows progress without changing recipe math.
 * A craft whose output does not fit holds at 100% (`blocked`) instead of
 * destroying items — the line jams, nothing vanishes.
 */
export class Crafter {
  recipe: Recipe;
  progressMs = 0;
  crafting = false;
  /** Completed but undeliverable: output buffer full, craft held. */
  blocked = false;
  input: Buffer;
  output: Buffer;
  private produced: Partial<Record<Item, number>> | null = null;

  constructor(recipe: Recipe, inputCap = 8, outputCap = 4) {
    this.recipe = recipe;
    this.input = createBuffer(inputCap);
    this.output = createBuffer(outputCap);
  }

  canStart(): boolean {
    if (this.crafting) return false;
    for (const [item, qty] of Object.entries(this.recipe.in)) {
      if (!bufferHas(this.input, item as Item, qty!)) return false;
    }
    return true;
  }

  /**
   * Advance one step. Returns true while actively crafting. On completion the
   * outputs (scaled by `scale`) must fit the output buffer; if they do not, the
   * craft holds at 100% with `blocked` set. Completed quantities are staged for
   * `takeProduced()` so callers credit exactly what was made.
   */
  tick(dtMs: number, multiplier: number, scale: OutScale = NO_SCALE): boolean {
    if (!this.crafting) {
      if (!this.canStart()) return false;
      for (const [item, qty] of Object.entries(this.recipe.in)) {
        bufferTake(this.input, item as Item, qty!);
      }
      this.crafting = true;
      this.progressMs = 0;
    }
    this.progressMs += dtMs * multiplier;
    if (this.progressMs < this.recipe.timeMs) return true;
    let needed = 0;
    for (const [item, qty] of Object.entries(this.recipe.out)) needed += scale(item as Item, qty!);
    if (this.output.total + needed > this.output.cap) {
      this.progressMs = this.recipe.timeMs; // hold at 100%; keep `crafting` true
      this.blocked = true;
      return true;
    }
    this.blocked = false;
    const made: Partial<Record<Item, number>> = {};
    for (const [item, qty] of Object.entries(this.recipe.out)) {
      const n = scale(item as Item, qty!);
      if (n > 0) {
        bufferAdd(this.output, item as Item, n);
        made[item as Item] = n;
      }
    }
    this.produced = made;
    this.crafting = false;
    this.progressMs = 0;
    return false;
  }

  /** Output credited by the craft that finished since the last call (null = none). */
  takeProduced(): Partial<Record<Item, number>> | null {
    const p = this.produced;
    this.produced = null;
    return p;
  }
}

/** Scale a recipe output at craft completion (tech bonuses that add quantity). */
export type OutScale = (item: Item, qty: number) => number;

export const NO_SCALE: OutScale = (_item, qty) => qty;

/** Legal Printer tech: +1 brief per craft, applied at completion so the shared
 * recipe object is never mutated (that leaked across runs and reloads). */
export const BRIEF_SCALE: OutScale = (item, qty) => (item === "brief" ? qty + 1 : qty);

/** Output scaling a machine kind applies at completion, given current tech. */
export function scaleFor(kind: EntityKind, tech: TechState): OutScale {
  return kind === "printer" && tech.briefEfficiency > 0 ? BRIEF_SCALE : NO_SCALE;
}

/** The buffer an entity accepts deliveries into, or null if it accepts none. */
export function inputBufferOf(e: Entity): Buffer | null {
  return e.machine?.crafter.input ?? e.funding?.input ?? e.input ?? null;
}

/**
 * Entities that end an item's life: research points, the IPO, and tower ammo
 * are consumed, never resold. A crafter buffer is a queue, not a warehouse,
 * and cascade rates cannot balance exactly (a strategy factory makes
 * 0.25 alpha/s, a research desk burns 0.125/s) — and belts have no throttle.
 * So if a terminal sink could refuse, one over-supplied line would back its
 * belt up and freeze everything above it for the rest of the run: an
 * ammo-full turret stopped every legal printer behind it, and a desk that
 * filled its alpha share stopped the lab. Surplus is written off instead
 * (§5.7) — the briefs were spent on security either way.
 */
export function isTerminalSink(e: Entity): boolean {
  return e.kind === "research" || e.kind === "roadshow" || e.kind === "tower";
}

/** Whether `e` will take `item` (recipe inputs, sellable fuel, ammo, alpha). */
export function acceptsItem(e: Entity, item: Item, tech: TechState): boolean {
  const c = e.machine?.crafter;
  if (c) {
    if ((c.recipe.in[item] ?? 0) <= 0) return false;
    // A pad is a queue shared by every ingredient it starts from, so no one
    // of them may fill it: a fast lane (an analytics making 0.5 signal/s)
    // otherwise packs all twelve slots and the slow lane (a factory making
    // 0.25 alpha/s) is refused — and then written off — forever, and a desk
    // that cannot hold both inputs at once never crafts again (§5.7).
    const kinds = Object.keys(c.recipe.in).length;
    return (c.input.items[item] ?? 0) < Math.ceil(c.input.cap / Math.max(1, kinds));
  }
  if (e.funding) return sellableFuels(tech).some((f) => f.fuel === item);
  if (e.kind === "tower") return item === "brief";
  if (e.kind === "roadshow") return item === "alpha";
  return false;
}
