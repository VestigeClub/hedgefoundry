import type { World, Entity } from "../sim/world";
import { KIND_LABEL } from "../sim/world";
import { RECIPE_LABEL } from "../sim/recipes";
import { ITEM_LABEL, type Item } from "../sim/items";

/** Right-side entity inspector. Re-renders on selection change + live updates. */
export class Panel {
  private selected: Entity | null = null;
  private world: World | null = null;

  constructor(private readonly el: HTMLElement) {}

  hasSelection(): boolean {
    return this.selected !== null;
  }

  current(): Entity | null {
    return this.selected;
  }

  setSelection(world: World, e: Entity | null): void {
    this.world = world;
    this.selected = e;
    this.el.classList.toggle("open", e !== null);
    if (e) this.render();
  }

  update(world: World): void {
    this.world = world;
    if (this.selected && world.entities.has(this.selected.id)) this.render();
  }

  private render(): void {
    const e = this.selected!;
    const w = this.world!;
    const powered = w.powered.has(e.id);
    const parts: string[] = [];
    parts.push(`<div class="p-title">${KIND_LABEL[e.kind]} <span class="p-id">#${e.id}</span></div>`);
    parts.push(`<div class="p-row">GRID: <span class="${powered ? "up" : "down"}">${powered ? "POWERED" : "NO POWER"}</span></div>`);

    if (e.machine) {
      const c = e.machine.crafter;
      parts.push(`<div class="p-row">RECIPE: ${RECIPE_LABEL[c.recipe.id]}</div>`);
      const ins = Object.entries(c.recipe.in).map(([it, q]) => `${ITEM_LABEL[it as Item]} ${q}`).join(" + ");
      const outs = Object.entries(c.recipe.out).map(([it, q]) => `${ITEM_LABEL[it as Item]} ${q}`).join(" + ");
      parts.push(`<div class="p-row">IN: ${ins}</div>`);
      parts.push(`<div class="p-row">OUT: ${outs || "—"}</div>`);
      const prog = c.crafting ? `${Math.floor((c.progressMs / c.recipe.timeMs) * 100)}%` : "idle";
      parts.push(`<div class="p-row">STATUS: ${c.crafting ? "CRAFTING " + prog : "IDLE"}</div>`);
      parts.push(`<div class="p-row">INPUT: ${bufferSummary(c.input)}</div>`);
      parts.push(`<div class="p-row">OUTPUT: ${bufferSummary(c.output)}</div>`);
    }
    if (e.miner) {
      parts.push(`<div class="p-row">OUTPUT: ${bufferSummary(e.miner.output)}</div>`);
      parts.push(`<div class="p-row">RATE: 1/s × patch richness</div>`);
    }
    if (e.funding) {
      parts.push(`<div class="p-row">FUEL (T0): CLEAN DATA 2/s</div>`);
      parts.push(`<div class="p-row">INPUT: ${bufferSummary(e.funding.input)}</div>`);
      parts.push(`<div class="p-row">OUTPUT: 40 CAP/s</div>`);
    }
    if (e.belt) {
      parts.push(`<div class="p-row">DIR: ${e.belt.dir} · SPEED: ${e.belt.speed} t/s</div>`);
      parts.push(`<div class="p-row">ITEMS: ${e.belt.items.length}</div>`);
    }
    if (e.trader) {
      parts.push(`<div class="p-row">ARM: ${e.trader.dir} · CYCLE: 2.0s</div>`);
    }
    if (e.kind === "link") parts.push(`<div class="p-row">RANGE: 7 tiles</div>`);
    if (e.kind === "vault") parts.push(`<div class="p-row">+50K CAPACITY</div>`);

    parts.push(`<div class="p-row dim">[X] REMOVE</div>`);
    this.el.innerHTML = parts.join("");
  }
}

function bufferSummary(buf: { items: Partial<Record<Item, number>> }): string {
  const entries = Object.entries(buf.items).filter(([, q]) => q! > 0);
  if (entries.length === 0) return "empty";
  return entries.map(([it, q]) => `${ITEM_LABEL[it as Item]} ${q}`).join(", ");
}
