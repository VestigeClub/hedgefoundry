import type { World } from "./world";

/**
 * Trading-desk positions (DESIGN.md §5.10). A desk takes capital positions on
 * the live tape: margin ($ size) is debited at open, pnl settles at close
 * (long: size × (px/entry − 1), short: size × (1 − px/entry)), and every
 * close leaks +2 Impact — the desk pollutes like every machine. Tuning
 * constants live here so balance passes are one-line edits.
 */
export const POSITION_SIZE_USD = 50_000;
/** Auto-close after 5 sim-min (DESIGN.md §5.10). */
export const POSITION_LIFE_MS = 300_000;
export const MAX_OPEN_POSITIONS = 5;
/** Impact leaked per close (DESIGN.md §5.10). */
export const IMPACT_PER_CLOSE = 2;

export interface Position {
  id: number;
  symbol: string;
  dir: "long" | "short";
  sizeUsd: number;
  entryPx: number;
  openedMs: number;
  closesMs: number;
  /** The desk that took the position — impact lands at its cell. */
  deskId: number;
}

export interface ClosedPosition {
  t: number;
  symbol: string;
  dir: "long" | "short";
  sizeUsd: number;
  pnl: number;
}

/** Unrealized pnl at `px` (long: price ratio − 1, short: 1 − price ratio). */
export function pnlOf(p: Position, px: number): number {
  return p.dir === "long" ? p.sizeUsd * (px / p.entryPx - 1) : p.sizeUsd * (1 - px / p.entryPx);
}

/**
 * Auto-close matured positions. Margin returns with the settled pnl, so a
 * catastrophic tape can zero the fund and start the margin-call path
 * (§5.9) but never overdraw it below zero on its own.
 */
export function updatePositions(w: World): void {
  for (let i = w.positions.length - 1; i >= 0; i--) {
    const p = w.positions[i]!;
    if (w.timeMs >= p.closesMs) {
      w.positions.splice(i, 1);
      w.settlePosition(p);
    }
  }
}
