/**
 * Minimap (audit B5, DESIGN.md §8): 96×96 chrome canvas. Terrain is
 * prerendered once into an offscreen buffer; each update (1 Hz,
 * timestamp-gated) blits it, stamps entities, HQ and the viewport rect.
 * Click-to-jump centers the camera on the clicked tile. The pixel math is
 * pure (`minimapToWorld`, unit-tested); the DOM path degrades to a no-op
 * when canvas is unavailable (happy-dom).
 */
import type { Camera } from "../engine/camera";
import { KIND_COLOR } from "../engine/entity-render";
import { PALETTE } from "../engine/renderer";
import { clamp } from "../engine/num";
import { TILE_SIZE, Tile, type TileMap } from "../world/tilemap";
import type { World } from "../sim/world";

/** On-screen square in CSS px. The buffer is square, so one size serves both axes. */
export const MINIMAP_SIZE = 96;
const BUFFER = 256; // prerendered terrain buffer (px)

/** Map a click in minimap px to world tile coordinates (pure — unit-tested). */
export function minimapToWorld(
  px: number,
  py: number,
  mapW: number,
  mapH: number,
  sizePx: number,
): { x: number; y: number } {
  return {
    x: clamp(Math.floor((px / sizePx) * mapW), 0, mapW - 1),
    y: clamp(Math.floor((py / sizePx) * mapH), 0, mapH - 1),
  };
}

export class Minimap {
  private ctx2d: CanvasRenderingContext2D | null;
  private readonly buffer: HTMLCanvasElement | null;
  private readonly canvas: HTMLCanvasElement | null;
  private lastDraw = -Infinity;

  constructor(
    root: HTMLElement,
    private readonly world: World,
    private readonly camera: Camera,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = BUFFER;
    canvas.height = BUFFER;
    root.appendChild(canvas);
    this.canvas = canvas;
    this.ctx2d = canvas.getContext("2d");
    this.buffer = document.createElement("canvas");
    this.buffer.width = BUFFER;
    this.buffer.height = BUFFER;
    this.prerender();
    canvas.addEventListener("click", (e) => {
      if (!this.ctx2d) return;
      const r = this.canvas!.getBoundingClientRect();
      const t = minimapToWorld(
        ((e.clientX - r.left) * BUFFER) / r.width,
        ((e.clientY - r.top) * BUFFER) / r.height,
        this.world.map.w,
        this.world.map.h,
        BUFFER,
      );
      this.camera.centerOn(t.x * TILE_SIZE + TILE_SIZE / 2, t.y * TILE_SIZE + TILE_SIZE / 2);
    });
  }

  /** Terrain is static for the run's lifetime — draw it once, blit later. */
  private prerender(): void {
    if (!this.buffer) return;
    const bctx = this.buffer.getContext("2d");
    const map: TileMap = this.world.map;
    const s = BUFFER / map.w; // px per tile
    bctx.fillStyle = PALETTE.bg;
    bctx.fillRect(0, 0, BUFFER, BUFFER);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, y);
        if (t === Tile.Feed) bctx.fillStyle = PALETTE.feed;
        else if (t === Tile.StalePool) bctx.fillStyle = PALETTE.pool;
        else continue; // floor keeps the background
        bctx.fillRect(x * s, y * s, s, s);
      }
    }
  }

  update(nowMs: number): void {
    if (!this.ctx2d || !this.buffer) return;
    if (nowMs - this.lastDraw < 1000) return; // 1 Hz throttle
    this.lastDraw = nowMs;
    const c = this.ctx2d;
    const map = this.world.map;
    const sx = BUFFER / map.w;
    const sy = BUFFER / map.h;
    c.drawImage(this.buffer, 0, 0);
    for (const e of this.world.entities.values()) {
      c.fillStyle = e.kind === "hq" ? "#ff3b5c" : (KIND_COLOR[e.kind] ?? "var(--cyan)");
      c.fillRect(e.x * sx, e.y * sy, e.kind === "hq" ? 4 : 2, e.kind === "hq" ? 4 : 2);
    }
    // Viewport rect (cyan, crisp on the 0.5 px line).
    const v = this.camera.visibleTiles(TILE_SIZE);
    c.strokeStyle = "rgba(0, 200, 255, 0.9)";
    c.lineWidth = 1;
    c.strokeRect(v.x0 * sx + 0.5, v.y0 * sy + 0.5, (v.x1 - v.x0) * sx, (v.y1 - v.y0) * sy);
  }
}
