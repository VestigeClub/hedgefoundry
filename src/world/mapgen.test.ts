import { describe, expect, it } from "vitest";
import { generateMap, type GenOptions } from "./mapgen";
import { Tile, TileMap } from "./tilemap";

const BASE: GenOptions = { width: 128, height: 128, seed: 42, startClearRadius: 20, poolClusters: 30 };

function poolCount(m: TileMap): number {
  let n = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === Tile.StalePool) n++;
  return n;
}

function feedCount(m: TileMap): number {
  let n = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === Tile.Feed) n++;
  return n;
}

describe("generateMap", () => {
  it("is deterministic for the same seed", () => {
    const a = generateMap(BASE);
    const b = generateMap(BASE);
    expect(a.map.data).toEqual(b.map.data);
    expect(a.feeds).toEqual(b.feeds);
  });

  it("keeps the spawn area clear (Chebyshev radius, strictly inside)", () => {
    const { map } = generateMap(BASE);
    const cx = Math.floor(map.w / 2);
    const cy = Math.floor(map.h / 2);
    for (let y = cy - 19; y <= cy + 19; y++) {
      for (let x = cx - 19; x <= cx + 19; x++) {
        expect(map.get(x, y)).toBe(Tile.Floor);
      }
    }
  });

  it("places obstacles away from spawn", () => {
    const { map } = generateMap(BASE);
    expect(poolCount(map)).toBeGreaterThan(0);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        if (map.get(x, y) === Tile.StalePool) {
          expect(Math.max(Math.abs(x - 64), Math.abs(y - 64))).toBeGreaterThanOrEqual(20);
        }
      }
    }
  });

  it("places data feed patches with richness in [1.0, 2.2]", () => {
    const { map, feeds } = generateMap(BASE);
    expect(feedCount(map)).toBeGreaterThan(0);
    expect(feeds.length).toBeGreaterThan(0);
    for (const f of feeds) {
      expect(f.richness).toBeGreaterThanOrEqual(1.0);
      expect(f.richness).toBeLessThanOrEqual(2.2);
      expect(f.w).toBeGreaterThan(0);
      expect(f.h).toBeGreaterThan(0);
      // patch rect is away from spawn
      const cx = Math.floor(map.w / 2);
      const cy = Math.floor(map.h / 2);
      expect(Math.max(Math.abs(f.x + Math.floor(f.w / 2) - cx), Math.abs(f.y + Math.floor(f.h / 2) - cy))).toBeGreaterThanOrEqual(20);
    }
  });

  it("different seeds produce different maps", () => {
    const seeds = [1, 2, 3, 4, 5].map((seed) => generateMap({ ...BASE, seed }));
    for (let i = 1; i < seeds.length; i++) {
      const a = seeds[0]!;
      const b = seeds[i]!;
      const diff = a.map.data.some((v, k) => v !== b.map.data[k]);
      expect(diff).toBe(true);
    }
  });
});
