import type { World, Entity } from "../sim/world";
import { BRO_STATS, HIRE_QUOTA, KIND_LABEL, ROADSHOW_ALPHA_NEEDED, VAULT_CAPACITY } from "../sim/world";
import { RECIPE_LABEL, sellableFuels } from "../sim/recipes";
import { scaleFor, type Crafter } from "../sim/production";
import { ITEM_LABEL, type Item } from "../sim/items";

/**
 * Right-side entity inspector. The DOM is rebuilt only when the markup
 * actually changes — repainting every frame destroyed the node under the
 * cursor, so `click` never reached the HIRE button.
 */
export class Panel {
  private selected: Entity | null = null;
  private lastHtml = "";

  constructor(
    private readonly el: HTMLElement,
    private readonly world: World,
  ) {
    el.addEventListener("click", (ev) => {
      if ((ev.target as HTMLElement).closest("[data-hire]") && this.selected?.kind === "bro") {
        const ok = this.world.hireBro(this.selected.id);
        if (!ok) this.toast("NOT ENOUGH CAPITAL FOR COMP");
        else this.toast(`HIRED — QUOTA ${this.world.hired}/${HIRE_QUOTA}`);
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
    this.lastHtml = ""; // a reselect always repaints
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
      parts.push(`<div class="p-row">QUOTA: ${w.hired} / ${HIRE_QUOTA}</div>`);
      parts.push(`<button class="hire-btn" data-hire>HIRE (+0.5% ALPHA)</button>`);
    } else {
      // Belts, traders and links are never power-gated by the sim; a red
      // NO POWER on a working belt is a lie.
      if (e.kind !== "belt" && e.kind !== "trader" && e.kind !== "link") {
        const powered = w.powered.has(e.id);
        parts.push(`<div class="p-row">GRID: <span class="pill ${powered ? "up" : "down"}">${powered ? "POWERED" : "NO POWER"}</span></div>`);
      }

      if (e.machine) {
        const c = e.machine.crafter;
        const scale = scaleFor(e.kind, w.tech);
        parts.push(`<div class="p-row">RECIPE: ${RECIPE_LABEL[c.recipe.id]}</div>`);
        const ins = Object.entries(c.recipe.in).map(([it, q]) => `${ITEM_LABEL[it as Item]} ${q}`).join(" + ");
        const outs = Object.entries(c.recipe.out).map(([it, q]) => `${ITEM_LABEL[it as Item]} ${scale(it as Item, q!)}`).join(" + ");
        parts.push(`<div class="p-row">IN: ${ins}</div>`);
        parts.push(`<div class="p-row">OUT: ${outs || "—"}</div>`);
        parts.push(`<div class="p-row">STATUS: <span class="pill ${c.blocked ? "down" : c.crafting ? "up" : "warn"}">${machineStatus(c, w)}</span></div>`);
        parts.push(`<div class="p-row">INPUT: ${bufferSummary(c.input)}</div>`);
        parts.push(`<div class="p-row">OUTPUT: ${bufferSummary(c.output)}</div>`);
      }
      if (e.miner) {
        parts.push(`<div class="p-row">OUTPUT: ${bufferSummary(e.miner.output)}</div>`);
        parts.push(`<div class="p-row">RATE: 1/s × patch</div>`);
      }
      if (e.funding) {
        const options = sellableFuels(w.tech);
        const held = options.find((o) => (e.funding!.input.items[o.fuel] ?? 0) > 0);
        parts.push(`<div class="p-row">SELLS: ${options.map((o) => o.label).join(" · ")}</div>`);
        parts.push(
          `<div class="p-row">STATUS: <span class="pill ${held ? "up" : "warn"}">${
            held ? `SELLING ${held.label} → $${fmt(held.capPerSec)}/s` : "IDLE · NEEDS FUEL"
          }</span></div>`,
        );
        parts.push(`<div class="p-row">INPUT: ${bufferSummary(e.funding.input)}</div>`);
      }
      if (e.belt) {
        parts.push(`<div class="p-row">DIR: ${e.belt.dir} · SPEED: ${(e.belt.speed * (1 + 0.25 * w.tech.tapeSpeed)).toFixed(2)} t/s</div>`);
        parts.push(`<div class="p-row">ITEMS: ${e.belt.items.length}</div>`);
      }
      if (e.trader) {
        parts.push(`<div class="p-row">ARM: ${e.trader.dir} · CYCLE: ${(2 / (1 + 0.25 * w.tech.traderSpeed)).toFixed(1)}s</div>`);
      }
      if (e.kind === "link") parts.push(`<div class="p-row">RANGE: 7 tiles</div>`);
      if (e.kind === "vault") parts.push(`<div class="p-row">+${fmt(VAULT_CAPACITY)} CAPACITY</div>`);
      if (e.kind === "tower") {
        parts.push(`<div class="p-row">AMMO: ${bufferSummary(e.input ?? { items: {} })}</div>`);
        parts.push(`<div class="p-row">RANGE: ${12 + w.tech.towerRange * 4} · DMG: ${8 + w.tech.towerDamage * 8}</div>`);
      }
      if (e.kind === "roadshow") {
        parts.push(`<div class="p-row">HIRED: ${w.hired} / ${HIRE_QUOTA} ${w.hired >= HIRE_QUOTA ? "· QUOTA MET" : ""}</div>`);
        parts.push(`<div class="p-row">ALPHA: ${bufferSummary(e.input ?? { items: {} })}</div>`);
        parts.push(`<div class="p-row">IPO PROGRESS: ${Math.floor(e.roadshow!.progress)} / ${ROADSHOW_ALPHA_NEEDED}</div>`);
      }
      if (e.hp !== undefined) {
        parts.push(`<div class="p-row">HP: ${e.hp} / ${e.maxHp}</div>`);
      }
      parts.push(`<div class="p-row dim">[X] REMOVE</div>`);
    }

    const html = parts.join("");
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
  }
}

/** One-line machine diagnosis: jam, progress, or the exact missing inputs. */
function machineStatus(c: Crafter, w: World): string {
  if (c.blocked) return "JAMMED · OUTPUT FULL";
  if (c.crafting) return `CRAFTING ${Math.floor((c.progressMs / c.recipe.timeMs) * 100)}%`;
  // Research desks hold fire until the player picks a tech.
  if (c.recipe.id === "research" && !w.researchTarget) return "IDLE · PICK A TECH [T]";
  const missing = Object.entries(c.recipe.in)
    .filter(([it, q]) => (c.input.items[it as Item] ?? 0) < q!)
    .map(([it]) => ITEM_LABEL[it as Item]);
  return missing.length ? `IDLE · NEEDS ${missing.join(" + ")}` : "IDLE";
}

function bufferSummary(buf: { items: Partial<Record<Item, number>> }): string {
  const entries = Object.entries(buf.items).filter(([, q]) => q! > 0);
  if (entries.length === 0) return "empty";
  return entries.map(([it, q]) => `${ITEM_LABEL[it as Item]} ${q}`).join(", ");
}

function fmt(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v);
}
