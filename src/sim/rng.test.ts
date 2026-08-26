import { describe, expect, it } from "vitest";
import { Rng, mulberry32 } from "./rng";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it("differs across seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("stays within [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("Rng", () => {
  it("int is inclusive on both ends", () => {
    const r = new Rng(1);
    for (let i = 0; i < 10000; i++) {
      const v = r.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("pick returns members of the array", () => {
    const r = new Rng(2);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 1000; i++) {
      expect(items).toContain(r.pick(items));
    }
  });

  it("reproduces a full sequence from a seed (save/load contract)", () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 500; i++) {
      expect(a.int(0, 1_000_000)).toBe(b.int(0, 1_000_000));
    }
  });
});
