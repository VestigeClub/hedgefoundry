import { edgeSpot, broTypeFor } from "./update";
import type { World } from "./world";

/**
 * Scripted market events (DESIGN.md §5.11): one-time, keyed on sim time, in
 * all modes. Each fires exactly once, is logged to the end-game timeline,
 * and its modifiers restore themselves when their window closes:
 *  - 6 sim-min  SHORT RAID — wave timer resets, 5 extra bros at the edges;
 *  - 12 sim-min FLASH CRASH — feed richness ×0.7 for 60 sim-s;
 *  - 18 sim-min RALLY — fuel prices +25% for 60 sim-s.
 */
export const RAID_AT_MS = 6 * 60_000;
export const CRASH_AT_MS = 12 * 60_000;
export const RALLY_AT_MS = 18 * 60_000;
const WINDOW_MS = 60_000;

export function updateEvents(w: World, dtMs: number): void {
  void dtMs;
  const ev = w.events;
  if (!ev.fired["short-raid"] && w.timeMs >= RAID_AT_MS) {
    ev.fired["short-raid"] = true;
    w.broSpawnTimerMs = 0; // the next metered wave lands immediately
    let spawned = 0;
    for (let i = 0; i < 5; i++) {
      const spot = edgeSpot(w);
      if (spot && w.spawnBro(broTypeFor(w), spot.x, spot.y)) spawned++;
    }
    w.logEvent(`SHORT RAID · ${spawned} EXTRA BROS`);
    w.cue("wave", w.map.w / 2, w.map.h / 2, spawned);
  }
  if (!ev.fired["flash-crash"] && w.timeMs >= CRASH_AT_MS) {
    ev.fired["flash-crash"] = true;
    ev.richnessMult = 0.7;
    ev.richnessMultUntil = w.timeMs + WINDOW_MS;
    w.logEvent("FLASH CRASH · FEED RICHNESS −30%");
  } else if (ev.richnessMult !== 1 && w.timeMs >= ev.richnessMultUntil) {
    ev.richnessMult = 1;
  }
  if (!ev.fired["rally"] && w.timeMs >= RALLY_AT_MS) {
    ev.fired["rally"] = true;
    ev.fuelPriceMult = 1.25;
    ev.fuelPriceMultUntil = w.timeMs + WINDOW_MS;
    w.logEvent("RALLY · FUEL PRICES +25%");
  } else if (ev.fuelPriceMult !== 1 && w.timeMs >= ev.fuelPriceMultUntil) {
    ev.fuelPriceMult = 1;
  }
}
