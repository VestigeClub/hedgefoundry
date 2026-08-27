import type { Camera } from "../engine/camera";
import type { Input } from "../engine/input";
import { TILE_SIZE } from "../world/tilemap";
import { COSTS, DIRS, SIZES, type Dir, type Entity, type EntityKind, type World } from "../sim/world";

export interface BuildDef {
  kind: EntityKind;
  key: string;
  label: string;
}

export const BUILD_ORDER: BuildDef[] = [
  { kind: "miner", key: "1", label: "DATA MINER" },
  { kind: "cleaner", key: "2", label: "SIGNAL CLEANER" },
  { kind: "analytics", key: "3", label: "ANALYTICS ENGINE" },
  { kind: "factory", key: "4", label: "STRATEGY FACTORY" },
  { kind: "printer", key: "5", label: "LEGAL PRINTER" },
  { kind: "research", key: "6", label: "RESEARCH DESK" },
  { kind: "funding", key: "7", label: "FUNDING DESK" },
  { kind: "vault", key: "8", label: "TREASURY VAULT" },
  { kind: "link", key: "9", label: "TREASURY LINK" },
  { kind: "belt", key: "0", label: "TICKER TAPE" },
  { kind: "trader", key: "q", label: "TRADER" },
  { kind: "tower", key: "e", label: "COMPLIANCE TOWER" },
  { kind: "roadshow", key: "g", label: "ROADSHOW" },
];

// Input stores KeyboardEvent.code — map display keys to build kinds.
const KEY_TO_KIND: Record<string, EntityKind> = {
  Digit1: "miner",
  Digit2: "cleaner",
  Digit3: "analytics",
  Digit4: "factory",
  Digit5: "printer",
  Digit6: "research",
  Digit7: "funding",
  Digit8: "vault",
  Digit9: "link",
  Digit0: "belt",
  KeyQ: "trader",
  KeyE: "tower",
  KeyG: "roadshow",
};

/** Pairs for the per-frame key scan, materialised once (no hot-path allocation). */
const KEY_BINDINGS = Object.entries(KEY_TO_KIND);

export interface BuildCallbacks {
  onSelect(e: Entity | null): void;
  onPlace(e: Entity): void;
  onDeny(): void;
  toast(msg: string): void;
}

export class BuildController {
  tool: EntityKind | null = null;
  rotate = 0;
  private prevLeft = false;
  private prevRight = false;
  /** Keys held last frame — build keys are edge-triggered (a held key must not
   * toggle the tool once per frame). */
  private readonly prevKeys = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly camera: Camera,
    private readonly input: Input,
    private readonly cb: BuildCallbacks,
    private readonly bar: HTMLElement,
  ) {
    for (const b of BUILD_ORDER) {
      const btn = document.createElement("button");
      btn.className = "build-btn";
      btn.innerHTML = `<span class="key">${b.key.toUpperCase()}</span><span class="lbl">${b.label}</span><span class="cost">$${fmtCost(COSTS[b.kind])}</span>`;
      btn.addEventListener("click", () => {
        this.setTool(b.kind);
        // Drop focus so number hotkeys keep working after a toolbar click.
        btn.blur();
      });
      this.bar.appendChild(btn);
    }
  }

  setTool(kind: EntityKind | null): void {
    this.tool = this.tool === kind ? null : kind;
    this.rotate = 0;
    this.syncBar();
  }

  update(): void {
    const left = this.input.mouse.left;
    const right = this.input.mouse.right;
    const pressed = (code: string): boolean => this.input.keys.has(code) && !this.prevKeys.has(code);
    for (const [key, kind] of KEY_BINDINGS) if (pressed(key)) this.setTool(kind);
    if (pressed("KeyR")) this.rotate++;
    if (pressed("Escape") && this.tool) {
      this.tool = null;
      this.syncBar();
    }
    if (right && !this.prevRight) this.setTool(null);

    if (left && !this.prevLeft) {
      const { tx, ty } = this.hoverTile();
      if (this.tool) {
        const err = this.world.canPlace(this.tool, tx, ty);
        if (err) {
          this.cb.onDeny();
          this.cb.toast(`${this.tool.toUpperCase()}: ${err}`);
        } else {
          const e = this.world.placeEntity(this.tool, tx, ty)!;
          if ((e.kind === "belt" || e.kind === "trader") && this.rotate % 4 !== 0) {
            const dirs = e.kind === "belt" ? e.belt!.dir : e.trader!.dir;
            const next = DIRS[(DIRS.indexOf(dirs) + this.rotate) % 4] as Dir;
            if (e.belt) e.belt.dir = next;
            else if (e.trader) e.trader.dir = next;
          }
          this.cb.onPlace(e);
          this.cb.onSelect(e);
        }
      } else {
        const e = this.world.entityAt(tx, ty);
        this.cb.onSelect(e ?? null);
      }
    }
    this.prevLeft = left;
    this.prevRight = right;
    this.prevKeys.clear();
    for (const k of this.input.keys) this.prevKeys.add(k);
  }

  hoverTile(): { tx: number; ty: number } {
    const w = this.camera.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    return { tx: Math.floor(w.x / TILE_SIZE), ty: Math.floor(w.y / TILE_SIZE) };
  }

  /** Ghost preview under the cursor while a tool is armed. */
  drawGhost(ctx: CanvasRenderingContext2D): void {
    if (!this.tool) return;
    const { tx, ty } = this.hoverTile();
    const s = SIZES[this.tool];
    const err = this.world.canPlace(this.tool, tx, ty);
    const wx = tx * TILE_SIZE;
    const wy = ty * TILE_SIZE;
    const x = (wx - this.camera.x) * this.camera.zoom;
    const y = (wy - this.camera.y) * this.camera.zoom;
    const z = TILE_SIZE * this.camera.zoom;
    ctx.fillStyle = err ? "rgba(255,59,92,0.18)" : "rgba(0,230,140,0.18)";
    ctx.strokeStyle = err ? "#ff3b5c" : "#00e68c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, s * z, s * z, 3);
    ctx.fill();
    ctx.stroke();
  }

  /** Hover outline on the tile under the cursor when no tool is armed. */
  drawHover(ctx: CanvasRenderingContext2D): void {
    if (this.tool) return;
    const { tx, ty } = this.hoverTile();
    const z = TILE_SIZE * this.camera.zoom;
    const x = (tx * TILE_SIZE - this.camera.x) * this.camera.zoom;
    const y = (ty * TILE_SIZE - this.camera.y) * this.camera.zoom;
    ctx.strokeStyle = "rgba(0,200,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, z, z, 3);
    ctx.stroke();
  }

  private syncBar(): void {
    for (const [i, btn] of [...this.bar.children].entries()) {
      btn.classList.toggle("active", BUILD_ORDER[i]?.kind === this.tool);
    }
  }
}

function fmtCost(v: number): string {
  return v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v);
}
