import { describe, expect, it } from "vitest";
import { generateMap } from "./mapgen";
import { Tile, TileMap } from "./tilemap";

const BASE = { width: 128, height: 128, seed: 42, startClearRadius: 20, poolClusters: 30 };

function poolCount(m: TileMap): number {
  let n = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) === Tile.StalePool) n++;
  return n;
}

describe("generateMap", () => {
  it("is deterministic for the same seed", () => {
    const a = generateMap(BASE);
    const b = generateMap(BASE);
    expect(a.data).toEqual(b.data);
  });

  it("keeps the spawn area clear (Chebyshev radius)", () => {
    const m = generateMap(BASE);
    const cx = Math.floor(m.w / 2);
    const cy = Math.floor(m.h / 2);
    for (let y = cy - 20; y <= cy + 20; y++) {
      for (let x = cx - 20; x <= cx + 20; x++) {
        expect(m.get(x, y)).toBe(Tile.Floor);
      }
    }
  });

  it("places some obstacles away from spawn", () => {
    const m = generateMap(BASE);
    expect(poolCount(m)).toBeGreaterThan(0);
    // every pool tile is outside the clear radius
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (m.get(x, y) === Tile.StalePool) {
          expect(Math.max(Math.abs(x - 64), Math.abs(y - 64))).toBeGreaterThanOrEqual(20);
        }
      }
    }
  });

  it("different seeds produce different maps", () => {
    const seeds = [1, 2, 3, 4, 5].map((seed) => generateMap({ ...BASE, seed }));
    for (let i = 1; i < seeds.length; i++) {
      const a = seeds[0]!;
      const b = seeds[i]!;
      const diff = a.data.some((v, k) => v !== b.data[k]);
      expect(diff).toBe(true);
    }
  });
});
