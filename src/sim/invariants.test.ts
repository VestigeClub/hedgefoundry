/**
 * Data-table invariants (OPERATIONS.md §1.5): every table whose silent truncation
 * would quietly unbalance the game gets an assertion here, so a spliced-out entry
 * fails loudly instead of shipping. Intra-file uniqueness is weak — `kind` and `key`
 * are already typed — so the load-bearing checks here are **cross-file**: the build
 * bar in `ui/build.ts` must agree with the sim's own authority in `sim/world.ts`
 * (`COSTS`, `SIZES`, `KIND_LABEL`), which is where a machine goes missing in practice.
 * `TECHS` id uniqueness lives in `research.test.ts:34`; `TechDef.effect` is
 * `Partial<TechState>` and gates no machine kind, so there is nothing to assert there.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_COINS } from "../market/sim-feed";
import { BUILD_ORDER } from "../ui/build";
import { COSTS, KIND_LABEL, SIZES, type EntityKind } from "./world";
import { ITEMS } from "./items";

/** The sim's full kind set, read off its cost table (the authority, not a copy). */
const ALL_KINDS = Object.keys(COSTS) as EntityKind[];

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

/** Membership index without a Set (project rule: `Record<K, true>` for string keys). */
function index(values: readonly string[]): Record<string, true> {
  const out: Record<string, true> = {};
  for (const v of values) out[v] = true;
  return out;
}

describe("data-table invariants", () => {
  it("BUILD_ORDER has one entry per kind and one hotbar key per entry", () => {
    expect(dupesOf(BUILD_ORDER.map((b) => b.kind))).toEqual([]);
    expect(dupesOf(BUILD_ORDER.map((b) => b.key))).toEqual([]);
    for (const b of BUILD_ORDER) expect(b.key.length).toBe(1);
  });

  it("every priced machine is reachable from the build bar", () => {
    // The failure this exists for: a kind added to COSTS/SIZES with a price and no
    // hotbar entry — legal TypeScript, and a machine the player can never place.
    const onBar = index(BUILD_ORDER.map((b) => b.kind));
    const pricedButUnplaceable = ALL_KINDS.filter((k) => COSTS[k] > 0 && !onBar[k]);
    expect(pricedButUnplaceable).toEqual([]);
  });

  it("everything on the build bar is priced and occupies at least one tile", () => {
    const unpriced = BUILD_ORDER.filter((b) => !(COSTS[b.kind] > 0)).map((b) => b.kind);
    expect(unpriced).toEqual([]);
    const zeroFootprint = BUILD_ORDER.filter((b) => !(SIZES[b.kind] >= 1)).map((b) => b.kind);
    expect(zeroFootprint).toEqual([]);
  });

  it("build-bar labels match KIND_LABEL, the sim's own names", () => {
    // UI copy drifting from the sim label is how two surfaces start disagreeing.
    const drifted = BUILD_ORDER.filter((b) => KIND_LABEL[b.kind] !== b.label).map(
      (b) => `${b.kind}: bar="${b.label}" sim="${KIND_LABEL[b.kind]}"`,
    );
    expect(drifted).toEqual([]);
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
