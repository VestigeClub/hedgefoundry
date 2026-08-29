/**
 * Canvas renderer: draws the tile map culled to the camera's visible range.
 * Quant terminal dark palette (DESIGN.md §8) — kept in sync with style.css.
 * Ground is not empty space: hash-speckled dust, a two-weight grid, and data
 * feeds that shimmer under a slow scan so the map reads as live tape.
 */
import type { Camera } from "./camera";
import { Tile, TileMap, TILE_SIZE } from "../world/tilemap";
import { IMPACT_CELL } from "../sim/world";
import type { World } from "../sim/world";

export const PALETTE = {
  bg: "#0a0e14",
  grid: "#13202e",
  gridMajor: "#18293a",
  speckle: "#16222f",
  panel: "#0f1620",
  pool: "#16222f",
  poolEdge: "#1c2c3d",
  feed: "#0d2431",
  feedInner: "#0e4a5c",
  feedEdge: "#12607a",
} as const;

/** Deterministic per-tile hash — stable ground detail without an asset pass. */
function tileHash(tx: number, ty: number): number {
  let h = (tx * 73856093) ^ (ty * 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  map: TileMap,
  camera: Camera,
  timeMs: number,
): void {
  const viewW = ctx.canvas.clientWidth;
  const viewH = ctx.canvas.clientHeight;
  const { x0, y0, x1, y1 } = camera.visibleTiles(TILE_SIZE);
  const xa = Math.max(0, x0);
  const ya = Math.max(0, y0);
  const xb = Math.min(map.w, x1);
  const yb = Math.min(map.h, y1);
  const s = TILE_SIZE * camera.zoom;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  // Ground dust: two hash-placed specks per tile, brighter over feeds.
  const dot = Math.max(1, s * 0.07);
  ctx.fillStyle = PALETTE.speckle;
  for (let ty = ya; ty < yb; ty++) {
    for (let tx = xa; tx < xb; tx++) {
      const t = map.get(tx, ty);
      if (t === Tile.StalePool) continue;
      const h = tileHash(tx, ty);
      const ox = (tx * TILE_SIZE - camera.x) * camera.zoom;
      const oy = (ty * TILE_SIZE - camera.y) * camera.zoom;
      if (t === Tile.Floor) {
        ctx.fillRect(ox + (h & 15) * s * 0.06, oy + ((h >> 4) & 15) * s * 0.06, dot, dot);
        ctx.fillRect(ox + ((h >> 9) & 15) * s * 0.06, oy + ((h >> 13) & 15) * s * 0.06, dot, dot);
      }
    }
  }

  // Tiles: stale pools (obstacles) and data feeds with a slow diagonal
  // shimmer, a breathing core, and a lit edge wherever feed meets ground.
  const shimmer = timeMs * 0.0004;
  for (let ty = ya; ty < yb; ty++) {
    for (let tx = xa; tx < xb; tx++) {
      const t = map.get(tx, ty);
      if (t === Tile.StalePool) {
        const ox = (tx * TILE_SIZE - camera.x) * camera.zoom;
        const oy = (ty * TILE_SIZE - camera.y) * camera.zoom;
        ctx.fillStyle = PALETTE.pool;
        ctx.fillRect(ox, oy, s, s);
        ctx.strokeStyle = PALETTE.poolEdge;
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + 1.5, oy + 1.5, s - 3, s - 3);
        continue;
      }
      if (t !== Tile.Feed) continue;
      const ox = (tx * TILE_SIZE - camera.x) * camera.zoom;
      const oy = (ty * TILE_SIZE - camera.y) * camera.zoom;
      ctx.fillStyle = PALETTE.feed;
      ctx.fillRect(ox, oy, s, s);
      // Shimmer band sweeping the cluster diagonally.
      const phase = (shimmer + (tx + ty) * 0.08) % 1;
      const band = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      ctx.globalAlpha = 0.12 + 0.1 * band;
      ctx.fillStyle = PALETTE.feedInner;
      ctx.fillRect(ox + s * 0.12, oy + s * 0.12, s * 0.76, s * 0.76);
      // Pulse core, breathing against its hash phase so the field is not a
      // single metronome.
      const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.002 + tileHash(tx, ty) % 16);
      ctx.globalAlpha = 0.55 + 0.35 * pulse;
      const cs = s * (0.24 + 0.1 * pulse);
      ctx.fillStyle = PALETTE.feedInner;
      ctx.fillRect(ox + (s - cs) / 2, oy + (s - cs) / 2, cs, cs);
      ctx.globalAlpha = 1;
      // Lit boundary edges.
      ctx.strokeStyle = PALETTE.feedEdge;
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      if (map.get(tx, ty - 1) !== Tile.Feed) { ctx.moveTo(ox, oy + 0.5); ctx.lineTo(ox + s, oy + 0.5); }
      if (map.get(tx, ty + 1) !== Tile.Feed) { ctx.moveTo(ox, oy + s - 0.5); ctx.lineTo(ox + s, oy + s - 0.5); }
      if (map.get(tx - 1, ty) !== Tile.Feed) { ctx.moveTo(ox + 0.5, oy); ctx.lineTo(ox + 0.5, oy + s); }
      if (map.get(tx + 1, ty) !== Tile.Feed) { ctx.moveTo(ox + s - 0.5, oy); ctx.lineTo(ox + s - 0.5, oy + s); }
      ctx.stroke();
    }
  }

  // Grid: minor lines every tile, major lines every 8 (depth without noise).
  ctx.lineWidth = 1;
  ctx.strokeStyle = PALETTE.grid;
  ctx.beginPath();
  for (let tx = xa; tx <= xb; tx++) {
    if (tx % 8 === 0) continue;
    const ox = (tx * TILE_SIZE - camera.x) * camera.zoom;
    ctx.moveTo(ox + 0.5, 0);
    ctx.lineTo(ox + 0.5, viewH);
  }
  for (let ty = ya; ty <= yb; ty++) {
    if (ty % 8 === 0) continue;
    const oy = (ty * TILE_SIZE - camera.y) * camera.zoom;
    ctx.moveTo(0, oy + 0.5);
    ctx.lineTo(viewW, oy + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = PALETTE.gridMajor;
  ctx.beginPath();
  for (let tx = xa - (xa % 8); tx <= xb; tx += 8) {
    const ox = (tx * TILE_SIZE - camera.x) * camera.zoom;
    ctx.moveTo(ox + 0.5, 0);
    ctx.lineTo(ox + 0.5, viewH);
  }
  for (let ty = ya - (ya % 8); ty <= yb; ty += 8) {
    const oy = (ty * TILE_SIZE - camera.y) * camera.zoom;
    ctx.moveTo(0, oy + 0.5);
    ctx.lineTo(viewW, oy + 0.5);
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
      ctx.fillStyle = `rgba(251,113,133,${Math.min(0.16, val * 0.045)})`;
      ctx.fillRect(x, y, s, s);
    }
  }
}
