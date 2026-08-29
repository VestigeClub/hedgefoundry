import type { Camera } from "../engine/camera";
import type { Input } from "../engine/input";
import { TILE_SIZE } from "../world/tilemap";
import { SIZES, type Dir, type Entity, type EntityKind, type World } from "../sim/world";
/**
 * Blueprint copy/paste (key B, DESIGN.md §8 chrome). Copy mode drags a
 * rectangle over placed machines and snapshots them; paste mode stamps the
 * snapshot elsewhere. Placement is atomic: every entry must pass
 * `world.canPlace` and the fund must cover the full bill before the first
 * tile lands. Session-only by design — nothing here is saved.
 */
export interface BlueprintEntry {
  kind: EntityKind;
  dx: number;
  dy: number;
  dir?: Dir;
}

export interface BlueprintSnapshot {
  entries: BlueprintEntry[];
  w: number;
  h: number;
}

export type BlueprintMode = "copy" | "paste" | null;
export const BLUEPRINT_CAP = 400;

/** Snapshot every rig entity whose footprint intersects the tile rect. */
export function copyBlueprint(w: World, x0: number, y0: number, x1: number, y1: number): BlueprintSnapshot | null {
  const rx0 = Math.min(x0, x1);
  const ry0 = Math.min(y0, y1);
  const rx1 = Math.max(x0, x1) + 1; // exclusive edges
  const ry1 = Math.max(y0, y1) + 1;
  const entries: BlueprintEntry[] = [];
  for (const e of w.entities.values()) {
    if (entries.length >= BLUEPRINT_CAP) break;
    if (e.kind === "hq" || e.kind === "bro") continue; // rigs only, not the fund or its attackers
    if (e.x < rx1 && e.x + e.w > rx0 && e.y < ry1 && e.y + e.h > ry0) {
      entries.push({
        kind: e.kind,
        dx: Math.round(e.x - rx0),
        dy: Math.round(e.y - ry0),
        ...(e.belt ? { dir: e.belt.dir } : e.trader ? { dir: e.trader.dir } : {}),
      });
    }
  }
  if (entries.length === 0) return null;
  return { entries, w: rx1 - rx0, h: ry1 - ry0 };
}

export interface StampResult {
  placed: number;
  cost: number;
  blocked: number;
}

/** Atomically stamp a snapshot at (tx, ty). Nothing places on any block. */
export function stampBlueprint(
  w: World,
  snap: BlueprintSnapshot,
  tx: number,
  ty: number,
  costOf: (kind: EntityKind) => number,
): StampResult {
  let cost = 0;
  let blocked = 0;
  for (const en of snap.entries) {
    cost += costOf(en.kind);
    if (w.canPlace(en.kind, tx + en.dx, ty + en.dy)) blocked++;
  }
  if (blocked > 0 || w.capital < cost) return { placed: 0, cost: 0, blocked: blocked || snap.entries.length };
  let placed = 0;
  for (const en of snap.entries) {
    const e = w.placeEntity(en.kind, tx + en.dx, ty + en.dy);
    if (!e) continue; // cannot happen after the pre-check; counts as unplaced
    applyDir(e, en.dir);
    placed++;
  }
  return { placed, cost, blocked: 0 };
}

function applyDir(e: Entity, dir?: Dir): void {
  if (!dir) return;
  if (e.belt) e.belt.dir = dir;
  else if (e.trader) e.trader.dir = dir;
}

export class BlueprintController {
  mode: BlueprintMode = null;
  snapshot: BlueprintSnapshot | null = null;
  private dragStart: { tx: number; ty: number } | null = null;
  private dragNow: { tx: number; ty: number } | null = null;
  private prevLeft = false;

  constructor(
    private readonly world: World,
    private readonly camera: Camera,
    private readonly input: Input,
    private readonly costOf: (kind: EntityKind) => number,
    private readonly onToast: (msg: string) => void,
  ) {}

  /** B cycles: copy → paste → off. */
  cycle(): void {
    this.mode = this.mode === null ? "copy" : this.mode === "copy" ? "paste" : null;
    if (this.mode === null) {
      this.snapshot = null;
      this.dragStart = null;
      this.dragNow = null;
    }
    this.onToast(
      this.mode === "copy"
        ? "BLUEPRINT: DRAG A RECTANGLE TO COPY"
        : this.mode === "paste"
          ? "BLUEPRINT: CLICK TO STAMP"
          : "BLUEPRINT OFF",
    );
  }

  update(): void {
    if (!this.mode) {
      this.prevLeft = this.input.mouse.left;
      return;
    }
    const left = this.input.mouse.left;
    const { tx, ty } = this.hoverTile();
    if (this.mode === "copy") {
      if (left && !this.prevLeft) this.dragStart = { tx, ty };
      if (left && this.dragStart) this.dragNow = { tx, ty };
      if (!left && this.prevLeft && this.dragStart) {
        const snap = copyBlueprint(
          this.world,
          this.dragStart.tx,
          this.dragStart.ty,
          tx,
          ty,
        );
        if (!snap) this.onToast("NOTHING TO COPY");
        else {
          this.snapshot = snap;
          this.onToast(`COPIED ${snap.entries.length} — B TO STAMP`);
        }
        this.dragStart = null;
        this.dragNow = null;
      }
    } else if (left && !this.prevLeft && this.snapshot) {
      const r = stampBlueprint(this.world, this.snapshot, tx, ty, this.costOf);
      if (r.blocked > 0) this.onToast(`BLOCKED — ${r.blocked} COLLISIONS`);
      else this.onToast(`STAMPED ${r.placed} — $${r.cost}`);
    }
    this.prevLeft = left;
  }

  hoverTile(): { tx: number; ty: number } {
    const w = this.camera.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    return { tx: Math.floor(w.x / TILE_SIZE), ty: Math.floor(w.y / TILE_SIZE) };
  }

  /** Ghost preview: paste = per-entry tinted footprints; copy = drag rect. */
  drawGhost(ctx: CanvasRenderingContext2D): void {
    if (this.mode === "paste" && this.snapshot) {
      const { tx, ty } = this.hoverTile();
      for (const en of this.snapshot.entries) {
        const err = this.world.canPlace(en.kind, tx + en.dx, ty + en.dy);
        const s = SIZES[en.kind];
        const x = ((tx + en.dx) * TILE_SIZE - this.camera.x) * this.camera.zoom;
        const y = ((ty + en.dy) * TILE_SIZE - this.camera.y) * this.camera.zoom;
        const z = TILE_SIZE * this.camera.zoom;
        ctx.fillStyle = err ? "rgba(255,59,92,0.18)" : "rgba(0,230,140,0.18)";
        ctx.strokeStyle = err ? "#ff3b5c" : "#00e68c";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, s * z, s * z);
      }
    } else if (this.mode === "copy" && this.dragStart && this.dragNow) {
      const x0 = Math.min(this.dragStart.tx, this.dragNow.tx);
      const y0 = Math.min(this.dragStart.ty, this.dragNow.ty);
      const x1 = Math.max(this.dragStart.tx, this.dragNow.tx) + 1;
      const y1 = Math.max(this.dragStart.ty, this.dragNow.ty) + 1;
      const x = (x0 * TILE_SIZE - this.camera.x) * this.camera.zoom;
      const y = (y0 * TILE_SIZE - this.camera.y) * this.camera.zoom;
      ctx.fillStyle = "rgba(0,200,255,0.12)";
      ctx.strokeStyle = "#00c8ff";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, (x1 - x0) * TILE_SIZE * this.camera.zoom, (y1 - y0) * TILE_SIZE * this.camera.zoom);
    }
  }
}

