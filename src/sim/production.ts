import type { Item } from "./items";
import type { Recipe } from "./recipes";

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
 */
export class Crafter {
  recipe: Recipe;
  progressMs = 0;
  crafting = false;
  input: Buffer;
  output: Buffer;

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

  /** Returns true while actively crafting (drives burn). */
  tick(dtMs: number, multiplier: number): boolean {
    if (!this.crafting) {
      if (!this.canStart()) return false;
      for (const [item, qty] of Object.entries(this.recipe.in)) {
        bufferTake(this.input, item as Item, qty!);
      }
      this.crafting = true;
      this.progressMs = 0;
    }
    this.progressMs += dtMs * multiplier;
    if (this.progressMs >= this.recipe.timeMs) {
      this.crafting = false;
      this.progressMs = 0;
      for (const [item, qty] of Object.entries(this.recipe.out)) {
        bufferAdd(this.output, item as Item, qty!);
      }
      return false; // craft finished this tick
    }
    return true;
  }
}
