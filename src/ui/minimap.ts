import { clamp } from "../engine/num";
import type { Camera } from "../engine/camera";
import type { World } from "../sim/world";
import { Tile, TILE_SIZE, type TileMap } from "../world/tilemap";

const UP_DOT = "#00e68c";
const DOWN_DOT = "#ff3b5c";
const CAM_STROKE = "#00c8ff";

/** Terrain colour per tile, as RGB bytes for the ImageData painter below. */
const TILE_RGB: Record<Tile, readonly [number, number, number]> = {
  [Tile.Floor]: [0x13, 0x20, 0x2e],
  [Tile.StalePool]: [0x1b, 0x10, 0x20],
  [Tile.Feed]: [0x00, 0xc8, 0xff],
};

/**
 * Minimap: downsampled terrain (cached per map), entity dots, camera rect.
 * The element is 160×160 CSS px; drawing targets its backing buffer so DPI
 * scaling never skews the dots. Terrain repaints only when the map identity
 * changes; per-frame work is one blit plus a fillRect per entity.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly terrain: HTMLCanvasElement;
  private terrainMap: TileMap | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // happy-dom (test DOM) has no canvas 2d; never throw from a per-frame
    // renderer — draw() no-ops when the context is unavailable.
    this.ctx = canvas.getContext("2d");
    this.terrain = document.createElement("canvas");
  }

  draw(world: World, cam: Camera): void {
    const el = this.canvas;
    const ctx = this.ctx;
    if (!ctx) return;
    if (el.clientWidth === 0) return; // hidden — nothing to paint
    const W = el.width;
    const H = el.height;
    if (W < 1 || H < 1) return;
    const map = world.map;
    if (map !== this.terrainMap) this.paintTerrain(map);

    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, 0, 0, W, H);

    const sx = W / map.w;
    const sy = H / map.h;
    let color = "";
    for (const e of world.entities.values()) {
      const dot = e.kind === "bro" ? DOWN_DOT : UP_DOT;
      if (dot !== color) {
        ctx.fillStyle = dot;
        color = dot;
      }
      ctx.fillRect((e.x + e.w / 2) * sx - 1, (e.y + e.h / 2) * sy - 1, 2, 2);
    }

    // Camera viewport: visibleTiles is Camera's public view-extent accessor.
    const v = cam.visibleTiles(TILE_SIZE);
    const x0 = clamp(v.x0 * TILE_SIZE * sx, 0, W);
    const y0 = clamp(v.y0 * TILE_SIZE * sy, 0, H);
    const x1 = clamp(v.x1 * TILE_SIZE * sx, 0, W);
    const y1 = clamp(v.y1 * TILE_SIZE * sy, 0, H);
    ctx.strokeStyle = CAM_STROKE;
    ctx.lineWidth = 1;
    if (x1 > x0 && y1 > y0) ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  /** Screen point (client coords) inside the minimap element → world pixels. */
  toWorld(px: number, py: number, world: World): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return { x: 0, y: 0 };
    const map = world.map;
    return {
      x: ((px - r.left) / r.width) * map.w * TILE_SIZE,
      y: ((py - r.top) / r.height) * map.h * TILE_SIZE,
    };
  }

  /** One pixel per tile into the offscreen layer, blitted scaled each frame. */
  private paintTerrain(map: TileMap): void {
    const t = this.terrain;
    t.width = map.w;
    t.height = map.h;
    const g = t.getContext("2d");
    if (!g) throw new Error("minimap: terrain canvas 2d context unavailable");
    const img = g.createImageData(map.w, map.h);
    const d = img.data;
    for (let i = 0, p = 0; i < map.data.length; i++, p += 4) {
      const rgb = TILE_RGB[(map.data[i] ?? Tile.Floor) as Tile];
      d[p] = rgb[0];
      d[p + 1] = rgb[1];
      d[p + 2] = rgb[2];
      d[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.terrainMap = map;
  }
}
