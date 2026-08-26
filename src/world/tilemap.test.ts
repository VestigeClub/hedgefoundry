import { describe, expect, it } from "vitest";
import { Tile, TileMap } from "./tilemap";

describe("TileMap", () => {
  it("creates floor-filled map of the right size", () => {
    const m = TileMap.create(10, 8);
    expect(m.w).toBe(10);
    expect(m.h).toBe(8);
    expect(m.data).toHaveLength(80);
    expect(m.get(5, 5)).toBe(Tile.Floor);
  });

  it("set/get roundtrip", () => {
    const m = TileMap.create(4, 4);
    m.set(2, 1, Tile.StalePool);
    expect(m.get(2, 1)).toBe(Tile.StalePool);
    expect(m.get(1, 2)).toBe(Tile.Floor);
  });

  it("out-of-bounds get returns Floor, set is ignored", () => {
    const m = TileMap.create(4, 4);
    expect(m.get(-1, 0)).toBe(Tile.Floor);
    expect(m.get(0, 4)).toBe(Tile.Floor);
    m.set(-1, 0, Tile.StalePool);
    m.set(4, 4, Tile.StalePool);
    expect(m.get(0, 0)).toBe(Tile.Floor);
    expect(m.data.every((v) => v === Tile.Floor)).toBe(true);
  });

  it("isPassable matches obstacle state", () => {
    const m = TileMap.create(3, 3);
    m.set(1, 1, Tile.StalePool);
    expect(m.isPassable(1, 1)).toBe(false);
    expect(m.isPassable(0, 0)).toBe(true);
  });
});
