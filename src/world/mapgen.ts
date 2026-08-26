import { Rng } from "../sim/rng";
import { clamp } from "../engine/num";
import { Tile, TileMap } from "./tilemap";

export interface GenOptions {
  width: number;
  height: number;
  seed: number;
  /** Chebyshev radius around map center guaranteed clear of obstacles (spawn). */
  startClearRadius: number;
  /** Number of stale-pool clusters to scatter. */
  poolClusters: number;
}

/**
 * Deterministic map generation: floor + scattered stale-pool clusters via
 * random walks. Same seed → identical map. DESIGN.md §7.
 */
export function generateMap(opts: GenOptions): TileMap {
  const map = TileMap.create(opts.width, opts.height);
  const rng = new Rng(opts.seed);
  const cx = Math.floor(opts.width / 2);
  const cy = Math.floor(opts.height / 2);
  const clearOk = (x: number, y: number): boolean =>
    Math.max(Math.abs(x - cx), Math.abs(y - cy)) >= opts.startClearRadius;

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
  return map;
}
