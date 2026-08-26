/**
 * Deterministic seeded PRNG (mulberry32) — the ONLY randomness source in the
 * simulation. Sim state must reproduce exactly from (worldSeed, marketSeed).
 * DESIGN.md §10: determinism is a hard rule; no Math.random in sim paths.
 *
 * The internal `a` is exposed so save/load can resume the exact draw stream.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random generator with named helpers, seeded and deterministic. */
export class Rng {
  private a: number;

  constructor(seed: number, state?: number) {
    this.a = state ?? seed >>> 0;
  }

  /** Opaque internal state — enough to resume the exact draw stream. */
  state(): number {
    return this.a;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Random element of an array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty array");
    return items[this.int(0, items.length - 1)]!;
  }
}
