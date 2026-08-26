import type { World } from "../sim/world";
import { TECHS, TECH_BY_ID } from "../sim/research";

/**
 * Research panel (toggle: T). Lists techs with cost/status; clicking a
 * researchable tech points the Research Desk at it. DESIGN.md §5.5.
 */
export class ResearchPanel {
  open = false;
  private last = "";

  constructor(
    private readonly el: HTMLElement,
    private readonly world: World,
  ) {
    el.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-tech]");
      if (!btn) return;
      const id = btn.dataset.tech!;
      if (this.world.researched.has(id)) return;
      const def = TECH_BY_ID.get(id);
      if (def?.requires?.some((r) => !this.world.researched.has(r))) return;
      this.world.setResearchTarget(id);
      this.render();
    });
  }

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle("open", this.open);
    if (this.open) this.render();
  }

  /** Cheap live update: re-renders only when the status string changes. */
  update(): void {
    if (!this.open) return;
    const key = this.statusKey();
    if (key !== this.last) {
      this.last = key;
      this.render();
    }
  }

  private statusKey(): string {
    const w = this.world;
    return `${w.researchTarget ?? "-"}:${w.researchPoints}:${[...w.researched].sort().join(",")}:${w.entities.size}`;
  }

  private render(): void {
    const w = this.world;
    const rows = TECHS.map((t) => {
      const done = w.researched.has(t.id);
      const blocked = t.requires?.some((r) => !w.researched.has(r)) ?? false;
      const selected = w.researchTarget === t.id;
      const prog = selected ? Math.min(100, Math.round((w.researchPoints / t.cost) * 100)) : 0;
      const cls = done ? "done" : selected ? "sel" : blocked ? "blocked" : "";
      const status = done
        ? "RESEARCHED"
        : selected
          ? `IN PROGRESS ${prog}%`
          : blocked
            ? `NEEDS ${t.requires!.map((r) => TECH_BY_ID.get(r)?.label ?? r).join(", ")}`
            : `${t.cost} CRAFTS`;
      return `<button class="tech-row ${cls}" data-tech="${t.id}">
        <span class="tech-name">${t.label}</span>
        <span class="tech-desc">${t.desc}</span>
        <span class="tech-cost">${status}</span>
      </button>`;
    });
    this.el.innerHTML = `<div class="r-title">ALPHA RESEARCH <span class="r-hint">[T]</span></div>${rows.join("")}`;
  }
}
