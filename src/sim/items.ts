/**
 * Item catalogue. String literal union (vite-safe, serializable).
 * DESIGN.md §5.3 — one resource chain: tape → clean → signal → alpha.
 */

export type Item = "tape" | "clean" | "signal" | "alpha" | "brief";

export const ITEMS: readonly Item[] = ["tape", "clean", "signal", "alpha", "brief"];

export const ITEM_LABEL: Record<Item, string> = {
  tape: "RAW TAPE",
  clean: "CLEAN DATA",
  signal: "SIGNALS",
  alpha: "ALPHA",
  brief: "LEGAL BRIEF",
};

export const ITEM_COLOR: Record<Item, string> = {
  tape: "#7dd3fc", // raw feed — pale cyan
  clean: "#34d399", // processed — green
  signal: "#a78bfa", // derived — violet
  alpha: "#fbbf24", // return — amber
  brief: "#f472b6", // legal — pink
};
