/**
 * Data-table invariants (OPERATIONS.md §1.5): every table whose silent truncation
 * would quietly unbalance the game gets a uniqueness/positivity assertion here, so a
 * spliced-out entry fails loudly instead of shipping. `TECHS` id uniqueness lives in
 * `research.test.ts:34`; this file covers the rest.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_COINS } from "../market/sim-feed";
import { BUILD_ORDER } from "../ui/build";
import { ITEMS } from "./items";
import { COSTS } from "./world";

/** Values appearing more than once, in first-repeat order. */
function dupesOf(values: readonly string[]): string[] {
  const seen: Record<string, true> = {};
  const dupes: string[] = [];
  for (const v of values) {
    if (seen[v]) dupes.push(v);
    else seen[v] = true;
  }
  return dupes;
}

/** Machines that must cost capital — a free one would break the income curve. */
const PAID_KINDS: readonly string[] = [
  "miner",
  "cleaner",
  "analytics",
  "factory",
  "printer",
  "research",
  "funding",
];

describe("data-table invariants", () => {
  it("BUILD_ORDER has one entry per kind, one hotbar key per entry", () => {
    expect(dupesOf(BUILD_ORDER.map((b) => b.kind))).toEqual([]);
    expect(dupesOf(BUILD_ORDER.map((b) => b.key))).toEqual([]);
    expect(dupesOf(BUILD_ORDER.map((b) => b.label))).toEqual([]);
    for (const b of BUILD_ORDER) expect(b.key.length).toBe(1);
  });

  it("every buildable kind is priced, and the core machines are not free", () => {
    const byKind: Record<string, number> = {};
    for (const b of BUILD_ORDER) {
      const cost = COSTS[b.kind];
      expect(Number.isFinite(cost)).toBe(true);
      byKind[b.kind] = cost;
    }
    for (const kind of PAID_KINDS) {
      expect(byKind[kind], `${kind} is not on the build bar`).toBeGreaterThan(0);
    }
  });

  it("ITEMS is non-empty and holds no duplicate item", () => {
    expect(ITEMS.length).toBeGreaterThan(0);
    expect(dupesOf([...ITEMS])).toEqual([]);
  });

  it("DEFAULT_COINS are unique with a positive base and volatility", () => {
    expect(DEFAULT_COINS.length).toBeGreaterThan(0);
    expect(dupesOf(DEFAULT_COINS.map((c) => c.coin))).toEqual([]);
    for (const c of DEFAULT_COINS) {
      expect(c.base).toBeGreaterThan(0);
      expect(c.vol).toBeGreaterThan(0);
    }
  });
});
