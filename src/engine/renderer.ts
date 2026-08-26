/**
 * Canvas renderer: draws the tile map culled to the camera's visible range.
 * Quant terminal dark palette (DESIGN.md §8) — kept in sync with style.css.
 */
import type { Camera } from "./camera";
import { Tile, TileMap, TILE_SIZE } from "../world/tilemap";
import { IMPACT_CELL } from "../sim/world";
import type { World } from "../sim/world";
export const PALETTE = {
  bg: "#0a0e14",
  grid: "#13202e",
  panel: "#0f1620",
  pool: "#16222f",
  poolEdge: "#1c2c3d",
  feed: "#0d2431",
} as const;

export function drawMap(
  ctx: CanvasRenderingContext2D,
  map: TileMap,
  camera: Camera,
): void {
  const viewW = ctx.canvas.clientWidth;
  const viewH = ctx.canvas.clientHeight;
  const { x0, y0, x1, y1 } = camera.visibleTiles(TILE_SIZE);
  const xa = Math.max(0, x0);
  const ya = Math.max(0, y0);
  const xb = Math.min(map.w, x1);
  const yb = Math.min(map.h, y1);

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  // Tiles: data feeds (cyan tint + pulse dot) and stale pools (obstacles).
  for (let ty = ya; ty < yb; ty++) {
    for (let tx = xa; tx < xb; tx++) {
      const t = map.get(tx, ty);
      if (t !== Tile.StalePool && t !== Tile.Feed) continue;
      const sx = (tx * TILE_SIZE - camera.x) * camera.zoom;
      const sy = (ty * TILE_SIZE - camera.y) * camera.zoom;
      const s = TILE_SIZE * camera.zoom;
      ctx.fillStyle = t === Tile.Feed ? PALETTE.feed : PALETTE.pool;
      ctx.fillRect(sx, sy, s, s);
      if (t === Tile.Feed) {
        ctx.fillStyle = "#0e4a5c";
        ctx.fillRect(sx + s * 0.3, sy + s * 0.3, s * 0.4, s * 0.4);
      }
    }
  }

  // Grid lines, culled to the visible range.
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let tx = xa; tx <= xb; tx++) {
    const sx = (tx * TILE_SIZE - camera.x) * camera.zoom;
    ctx.moveTo(sx + 0.5, 0);
    ctx.lineTo(sx + 0.5, viewH);
  }
  for (let ty = ya; ty <= yb; ty++) {
    const sy = (ty * TILE_SIZE - camera.y) * camera.zoom;
    ctx.moveTo(0, sy + 0.5);
    ctx.lineTo(viewW, sy + 0.5);
  }
  ctx.stroke();
}

/** Faint red wash over high-impact cells (pollution analog, DESIGN.md §5.7). */
export function drawImpact(ctx: CanvasRenderingContext2D, world: World, camera: Camera): void {
  const v = camera.visibleTiles(TILE_SIZE);
  const cx0 = Math.max(0, Math.floor(v.x0 / IMPACT_CELL));
  const cy0 = Math.max(0, Math.floor(v.y0 / IMPACT_CELL));
  const cx1 = Math.min(world.impactW - 1, Math.ceil(v.x1 / IMPACT_CELL));
  const cy1 = Math.min(world.impactH - 1, Math.ceil(v.y1 / IMPACT_CELL));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const val = world.impact[cy * world.impactW + cx] ?? 0;
      if (val < 0.05) continue;
      const x = (cx * IMPACT_CELL * TILE_SIZE - camera.x) * camera.zoom;
      const y = (cy * IMPACT_CELL * TILE_SIZE - camera.y) * camera.zoom;
      const s = IMPACT_CELL * TILE_SIZE * camera.zoom;
      ctx.fillStyle = `rgba(251,113,133,${Math.min(0.28, val * 0.02)})`;
      ctx.fillRect(x, y, s, s);
    }
  }
}
