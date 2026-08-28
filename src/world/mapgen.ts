import { Rng } from "../sim/rng";
import { clamp } from "../engine/num";
import { Tile, TileMap } from "./tilemap";

export interface FeedPatch {
  id: number;
  /** Bounding rect in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Miner yield multiplier (1.0–2.2). */
  richness: number;
}

export interface GenResult {
  map: TileMap;
  feeds: FeedPatch[];
}

export interface GenOptions {
  width: number;
  height: number;
  seed: number;
  /** Chebyshev radius around map center guaranteed clear of obstacles (spawn). */
  startClearRadius: number;
  /** Number of stale-pool clusters to scatter. */
  poolClusters: number;
  /** Number of data-feed patches. */
  feedPatches?: number;
}

/**
 * Deterministic map generation: floor + stale-pool clusters (random walks)
 * + data-feed patches (ellipse-ish blobs of Feed tiles with richness).
 * Same seed → identical map. DESIGN.md §7.
 */
export function generateMap(opts: GenOptions): GenResult {
  const map = TileMap.create(opts.width, opts.height);
  const rng = new Rng(opts.seed);
  const cx = Math.floor(opts.width / 2);
  const cy = Math.floor(opts.height / 2);
  const clearOk = (x: number, y: number): boolean =>
    Math.max(Math.abs(x - cx), Math.abs(y - cy)) >= opts.startClearRadius;

  // Stale pools (obstacles) — random walks.
  for (let c = 0; c < opts.poolClusters; c++) {
    const sx = rng.int(1, opts.width - 2);
    const sy = rng.int(1, opts.height - 2);
    if (!clearOk(sx, sy)) continue;
    let x = sx;
    let y = sy;
    const steps = rng.int(8, 24);
    for (let s = 0; s < steps; s++) {
      x = clamp(x + rng.int(-1, 1), 1, opts.width - 2);
      y = clamp(y + rng.int(-1, 1), 1, opts.height - 2);
      if (clearOk(x, y)) map.set(x, y, Tile.StalePool);
      if (rng.chance(0.3) && clearOk(x + 1, y)) map.set(x + 1, y, Tile.StalePool);
      if (rng.chance(0.3) && clearOk(x, y + 1)) map.set(x, y + 1, Tile.StalePool);
    }
  }

  // Data feeds — blob clusters of Feed tiles.
  const nFeeds = opts.feedPatches ?? 9;
  const feeds: FeedPatch[] = [];
  for (let f = 0; f < nFeeds; f++) {
    const fx = rng.int(6, opts.width - 7);
    const fy = rng.int(6, opts.height - 7);
    if (!clearOk(fx, fy)) continue;
    const richness = Math.round(rng.range(1.0, 2.2) * 10) / 10;
    const tiles = new Set<number>();
    const steps = rng.int(30, 70);
    let x = fx;
    let y = fy;
    for (let s = 0; s < steps; s++) {
      x = clamp(x + rng.int(-1, 1), 1, opts.width - 2);
      y = clamp(y + rng.int(-1, 1), 1, opts.height - 2);
      if (clearOk(x, y)) {
        map.set(x, y, Tile.Feed);
        tiles.add(y * opts.width + x);
        if (rng.chance(0.35) && clearOk(x + 1, y)) {
          map.set(x + 1, y, Tile.Feed);
          tiles.add(y * opts.width + x + 1);
        }
        if (rng.chance(0.35) && clearOk(x, y + 1)) {
          map.set(x, y + 1, Tile.Feed);
          tiles.add((y + 1) * opts.width + x);
        }
      }
    }
    if (tiles.size < 8) continue;
    let minX = opts.width;
    let minY = opts.height;
    let maxX = 0;
    let maxY = 0;
    for (const idx of tiles) {
      const tx = idx % opts.width;
      const ty = Math.floor(idx / opts.width);
      if (tx < minX) minX = tx;
      if (tx > maxX) maxX = tx;
      if (ty < minY) minY = ty;
      if (ty > maxY) maxY = ty;
    }
    const rectCx = minX + Math.floor((maxX - minX) / 2);
    const rectCy = minY + Math.floor((maxY - minY) / 2);
    if (!clearOk(rectCx, rectCy)) {
      // Walk drifted into the spawn zone — unmark and drop the patch.
      for (const idx of tiles) map.set(idx % opts.width, Math.floor(idx / opts.width), Tile.Floor);
      continue;
    }
    feeds.push({ id: feeds.length + 1, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, richness });
  }

  return { map, feeds };
}
