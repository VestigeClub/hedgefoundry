import type { Item } from "./items";

/**
 * Craft recipes. times are per-craft in ms; burn is capital per second while
 * the machine is working (DESIGN.md §5.4).
 */
export interface Recipe {
  id: string;
  in: Partial<Record<Item, number>>;
  out: Partial<Record<Item, number>>;
  timeMs: number;
  burn: number;
}

export const RECIPES: Record<string, Recipe> = {
  clean: { id: "clean", in: { tape: 1 }, out: { clean: 1 }, timeMs: 2_000, burn: 20 },
  signal: { id: "signal", in: { clean: 2 }, out: { signal: 1 }, timeMs: 3_000, burn: 30 },
  alpha: { id: "alpha", in: { signal: 3 }, out: { alpha: 1 }, timeMs: 5_000, burn: 60 },
  brief: { id: "brief", in: { clean: 1, signal: 1 }, out: { brief: 2 }, timeMs: 2_000, burn: 15 },
  research: { id: "research", in: { alpha: 1, signal: 1 }, out: {}, timeMs: 10_000, burn: 40 },
};

export const RECIPE_LABEL: Record<string, string> = {
  clean: "SIGNAL CLEANER",
  signal: "ANALYTICS ENGINE",
  alpha: "STRATEGY FACTORY",
  brief: "LEGAL PRINTER",
  research: "RESEARCH DESK",
};
