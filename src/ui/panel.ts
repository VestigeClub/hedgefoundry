import type { World, Entity } from "../sim/world";
import { BRO_STATS, KIND_LABEL } from "../sim/world";
import { RECIPE_LABEL } from "../sim/recipes";
import { ITEM_LABEL, type Item } from "../sim/items";

/** Right-side entity inspector. Re-renders on selection change + live updates. */
export class Panel {
  private selected: Entity | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly world: World,
  ) {
    el.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest("[data-hire]") && this.selected?.kind === "bro") {
        const ok = this.world.hireBro(this.selected.id);
        if (!ok) this.toast("NOT ENOUGH CAPITAL FOR COMP");
        this.selected = null;
        this.el.classList.remove("open");
      }
    });
  }

  private toast(msg: string): void {
    // Reuse the global toast element if present.
    const toast = document.querySelector<HTMLElement>("#toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1600);
  }

  hasSelection(): boolean {
    return this.selected !== null;
  }

  current(): Entity | null {
    return this.selected;
  }

  setSelection(e: Entity | null): void {
    this.selected = e;
    this.el.classList.toggle("open", e !== null);
    if (e) this.render();
  }

  update(): void {
    if (this.selected && this.world.entities.has(this.selected.id)) this.render();
  }

  private render(): void {
    const e = this.selected!;
    const w = this.world;
    const parts: string[] = [];
    parts.push(`<div class="p-title">${KIND_LABEL[e.kind]} <span class="p-id">#${e.id}</span></div>`);

    if (e.kind === "bro") {
      const stats = BRO_STATS[e.bro!.type];
      parts.push(`<div class="p-row">TYPE: ${stats.label}</div>`);
      parts.push(`<div class="p-row">HP: ${e.hp} / ${e.maxHp}</div>`);
      const cost = Math.round(stats.comp * (1 - 0.15 * w.tech.compDiscount));
      parts.push(`<div class="p-row">COMP: $${fmt(cost)}</div>`);
      parts.push(`<div class="p-row">QUOTA: ${w.hired} / 250</div>`);
      parts.push(`<button class="hire-btn" data-hire>HIRE (+0.5% ALPHA)</button>`);
    } else {
      const powered = w.powered.has(e.id);
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
        parts.push(`<div class="p-row">RATE: 1/s × patch</div>`);
      }
      if (e.funding) {
        const TIERS = [
          { fuel: "CLEAN DATA", rate: 2, out: 40 },
          { fuel: "SIGNALS", rate: 4, out: 160 },
          { fuel: "ALPHA", rate: 2, out: 600 },
        ] as const;
        const tier = TIERS[Math.min(w.tech.fuelTier, TIERS.length - 1)]!;
        parts.push(`<div class="p-row">FUEL: ${tier.fuel} ${tier.rate}/s</div>`);
        parts.push(`<div class="p-row">INPUT: ${bufferSummary(e.funding.input)}</div>`);
        parts.push(`<div class="p-row">OUTPUT: ${tier.out} CAP/s</div>`);
      }
      if (e.belt) {
        parts.push(`<div class="p-row">DIR: ${e.belt.dir} · SPEED: ${(e.belt.speed * (1 + 0.25 * w.tech.tapeSpeed)).toFixed(2)} t/s</div>`);
        parts.push(`<div class="p-row">ITEMS: ${e.belt.items.length}</div>`);
      }
      if (e.trader) {
        parts.push(`<div class="p-row">ARM: ${e.trader.dir} · CYCLE: ${(2 / (1 + 0.25 * w.tech.traderSpeed)).toFixed(1)}s</div>`);
      }
      if (e.kind === "link") parts.push(`<div class="p-row">RANGE: 7 tiles</div>`);
      if (e.kind === "vault") parts.push(`<div class="p-row">+50K CAPACITY</div>`);
      if (e.kind === "tower") {
        parts.push(`<div class="p-row">AMMO: ${bufferSummary(e.input ?? { items: {} })}</div>`);
        parts.push(`<div class="p-row">RANGE: ${12 + w.tech.towerRange * 4} · DMG: ${8 + w.tech.towerDamage * 8}</div>`);
      }
      if (e.kind === "roadshow") {
        parts.push(`<div class="p-row">HIRED: ${w.hired} / 250 ${w.hired >= 250 ? "· QUOTA MET" : ""}</div>`);
        parts.push(`<div class="p-row">ALPHA: ${bufferSummary(e.input ?? { items: {} })}</div>`);
        parts.push(`<div class="p-row">IPO PROGRESS: ${Math.floor(e.roadshow!.progress)} / 400</div>`);
      }
      if (e.hp !== undefined) {
        parts.push(`<div class="p-row">HP: ${e.hp} / ${e.maxHp}</div>`);
      }
      parts.push(`<div class="p-row dim">[X] REMOVE</div>`);
    }
    this.el.innerHTML = parts.join("");
  }
}

function bufferSummary(buf: { items: Partial<Record<Item, number>> }): string {
  const entries = Object.entries(buf.items).filter(([, q]) => q! > 0);
  if (entries.length === 0) return "empty";
  return entries.map(([it, q]) => `${ITEM_LABEL[it as Item]} ${q}`).join(", ");
}

function fmt(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v);
}
