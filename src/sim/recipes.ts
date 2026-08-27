import { ITEM_LABEL, type Item } from "./items";
/**
 * Craft recipes (DESIGN.md §5.2). `timeMs` is per-craft; the capital draw of
 * a working machine is `burnOf()` in world.ts, not recipe data.
 *
 * The inputs are an exact cascade — at one machine per stage, each stage's
 * demand equals its upstream's output, so a line never starves itself:
 *
   miner    1×richness tape/s
   cleaner  tape 1        → clean  1 /1.0s  = 1.000 clean/s
   analytics clean 2      → signal 1 /2.0s  = 0.500 σ/s  (eats 1.0 clean/s)
   factory  signal 2      → alpha  1 /4.0s  = 0.250 α/s  (eats 0.500 σ/s)
   printer  clean 1       → brief  2 /2.0s  = 0.500 clean/s
   research alpha 1+sig 1          /8.0s   = 0.125 α/s + 0.125 σ/s
 *
 * A printer therefore needs its own miner+cleaner; sharing one cleaner
 * between an analytics engine and a printer halves both.
 */
export interface Recipe {
  id: string;
  in: Partial<Record<Item, number>>;
  out: Partial<Record<Item, number>>;
  timeMs: number;
}

export const RECIPES: Record<string, Recipe> = {
  clean: { id: "clean", in: { tape: 1 }, out: { clean: 1 }, timeMs: 1_000 },
  signal: { id: "signal", in: { clean: 2 }, out: { signal: 1 }, timeMs: 2_000 },
  alpha: { id: "alpha", in: { signal: 2 }, out: { alpha: 1 }, timeMs: 4_000 },
  brief: { id: "brief", in: { clean: 1 }, out: { brief: 2 }, timeMs: 2_000 },
  research: { id: "research", in: { alpha: 1, signal: 1 }, out: {}, timeMs: 8_000 },
};

export const RECIPE_LABEL: Record<string, string> = {
  clean: "SIGNAL CLEANER",
  signal: "ANALYTICS ENGINE",
  alpha: "STRATEGY FACTORY",
  brief: "LEGAL PRINTER",
  research: "RESEARCH DESK",
};

/** Steady output of one machine running this recipe (units per second). */
export function recipeRate(recipe: Recipe): number {
  return 1000 / recipe.timeMs;
}

/**
 * Funding desk economics (DESIGN.md §5.6). A desk sells whatever fuel you
 * feed it and pays the price of the best unlocked kind it holds — researching
 * a fuel tier widens what you may sell, it never force-switches a desk onto
 * fuel your lines cannot supply (that bankrupted bases). Burn rate is one
 * machine's steady output, so a desk is sized to one production line.
 *
 * Prices come from the balance pass (DESIGN.md §11), measured by the
 * win-reachability harness: a tier is only worth climbing if it pays back
 * while the bro clock is still running. Every line below returns its build
 * cost in ~110 s, so the ladder is a choice of scale, not of survival:
 *   clean   1.00/s × 250  − 30  = +220 $/s  (24k line  → 109 s)
 *   signal  0.50/s × 900  − 60  = +390 $/s  (44k line  → 113 s)
 *   alpha   0.25/s × 3500 − 120 = +755 $/s  (89k line  → 118 s)
 * A mature base of a dozen alpha lines clears the doc's +$10k/s, which is
 * what the 250-head quota costs in comp (§5.8).
 */
export const FUEL_PRICE: Record<Item, number> = {
  tape: 0,
  clean: 250,
  signal: 900,
  alpha: 3_500,
  brief: 0,
};

/** Research tier (`world.tech.fuelTier`) that makes each fuel sellable. */
const FUEL_TIER: Partial<Record<Item, number>> = { clean: 0, signal: 1, alpha: 2 };

export interface FundingFuel {
  fuel: Item;
  /** Units burned per second — one production line's steady output. */
  ratePerSec: number;
  /** Capital per second while that fuel is in hand. */
  capPerSec: number;
  tier: number;
  label: string;
}

export const FUNDING_FUELS: readonly FundingFuel[] = (["clean", "signal", "alpha"] as Item[]).map((fuel) => {
  const ratePerSec = recipeRate(RECIPES[fuel]!);
  return {
    fuel,
    ratePerSec,
    capPerSec: FUEL_PRICE[fuel] * ratePerSec,
    tier: FUEL_TIER[fuel] ?? 0,
    label: ITEM_LABEL[fuel].toUpperCase(),
  };
});

/** Fuels this fund may sell, best price first — the order a desk draws them. */
export function sellableFuels(tech: { fuelTier: number }): FundingFuel[] {
  return FUNDING_FUELS.filter((f) => f.tier <= tech.fuelTier).reverse();
}

/** The best fuel a desk can currently sell (what the inspector headlines). */
export function fundingTier(tech: { fuelTier: number }): FundingFuel {
  return sellableFuels(tech)[0]!;
}
