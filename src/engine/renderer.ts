/**
 * Canvas renderer: draws the tile map culled to the camera's visible range.
 * Quant terminal dark palette (DESIGN.md §8) — kept in sync with style.css.
 */
import type { Camera } from "./camera";
import { Tile, TileMap, TILE_SIZE } from "../world/tilemap";

export const PALETTE = {
  bg: "#0a0e14",
  grid: "#13202e",
  pool: "#16222f",
  poolEdge: "#1c2c3d",
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

  // Obstacles (stale pools): only visible tiles.
  ctx.fillStyle = PALETTE.pool;
  for (let ty = ya; ty < yb; ty++) {
    for (let tx = xa; tx < xb; tx++) {
      if (map.get(tx, ty) !== Tile.StalePool) continue;
      const sx = (tx * TILE_SIZE - camera.x) * camera.zoom;
      const sy = (ty * TILE_SIZE - camera.y) * camera.zoom;
      const s = TILE_SIZE * camera.zoom;
      ctx.fillRect(sx, sy, s, s);
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
