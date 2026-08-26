/**
 * Capital power grid (DESIGN.md §5.4) — pure connectivity + brownout math.
 * Sources (vaults, funding desks) energize links; links chain; consumers are
 * powered within `range` tiles (manhattan, closest rects) of any energized
 * entity. Deterministic; unit-tested.
 */

export interface PowerEntity {
  id: number;
  kind: "source" | "link" | "consumer";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Manhattan gap between two rects (0 if they touch/overlap). */
export function rectGap(a: Rect, b: Rect): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const dx = Math.max(a.x, b.x) - Math.min(ax2, bx2);
  const dy = Math.max(a.y, b.y) - Math.min(ay2, by2);
  return Math.max(0, dx) + Math.max(0, dy);
}

/** Ids of consumers that are within range of an energized source/link network. */
export function computePowered(entities: readonly PowerEntity[], range: number): Set<number> {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const energized = new Set<number>();
  for (const e of entities) if (e.kind === "source") energized.add(e.id);

  let grew = true;
  let guard = entities.length + 1;
  while (grew && guard-- > 0) {
    grew = false;
    for (const e of entities) {
      if (e.kind !== "link" || energized.has(e.id)) continue;
      for (const id of energized) {
        if (rectGap(e, byId.get(id)!) <= range) {
          energized.add(e.id);
          grew = true;
          break;
        }
      }
    }
  }

  const powered = new Set<number>();
  for (const e of entities) {
    if (e.kind === "source") {
      powered.add(e.id);
      continue;
    }
    for (const id of energized) {
      if (rectGap(e, byId.get(id)!) <= range) {
        powered.add(e.id);
        break;
      }
    }
  }
  return powered;
}

/**
 * Brownout multiplier: production scales down when the capital reserve cannot
 * cover `bufferSec` of demand (Factorio power-shortage analog).
 * reserve <= 0 → 0.
 */
export function brownoutMultiplier(reserve: number, demandPerSec: number, bufferSec: number): number {
  if (demandPerSec <= 0) return 1;
  const cover = demandPerSec * bufferSec;
  if (cover <= 0) return 1;
  return Math.max(0, Math.min(1, reserve / cover));
}
