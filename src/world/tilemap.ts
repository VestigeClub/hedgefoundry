/** Tile grid. Pure sim data — deterministic, serializable (Uint8Array). */

export const TILE_SIZE = 32;

export const enum Tile {
  Floor = 0,
  StalePool = 1, // impassable obstacle ("rock" analog)
  Feed = 2, // data feed patch tile (walkable; miners must be placed on it)
}

export class TileMap {
  constructor(
    readonly w: number,
    readonly h: number,
    readonly data: Uint8Array,
  ) {}

  static create(w: number, h: number, fill: Tile = Tile.Floor): TileMap {
    return new TileMap(w, h, new Uint8Array(w * h).fill(fill));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) return Tile.Floor;
    return this.data[y * this.w + x] ?? Tile.Floor;
  }

  set(x: number, y: number, t: Tile): void {
    if (!this.inBounds(x, y)) return;
    this.data[y * this.w + x] = t;
  }

  /** True if a tile can host a building or be walked by bros. */
  isPassable(x: number, y: number): boolean {
    const t = this.get(x, y);
    return t === Tile.Floor || t === Tile.Feed;
  }
}
