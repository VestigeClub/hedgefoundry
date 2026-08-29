# HedgeFoundry Gap Closure — execution status

Plan: local://gap-closure-plan.md (approved 2026-08-29). Design contract:
`docs/DESIGN.md` §5.10/§5.11/§8 (commit d3a8802).

## Status

ALL TASKS SHIPPED. Last green `npm run check` at HEAD (typecheck + 173 tests
+ production build). Last commit: see `git log -1`.

| Task | Commit | Verification |
|---|---|---|
| 0 DESIGN contract | d3a8802 | §5.10/§5.11/§8/§13/§12b |
| 1 pause+speed (B1) | 1a25ce4 | `loop.test.ts` + live: Space freezes, chip PAUSED, 2×/4×, sim rate tracks |
| 2 tutorial card on game over (B2) | fe1309c | live: card absent under report overlay |
| 3 demolish hint + help overlay (B3) | 5bf8c3e | `build.dom.test.ts` + live: hint row, H overlay |
| 4 minimap (B5) | 5a48465 | `minimap.test.ts` + live: click-to-jump, viewport rect |
| 5 status chip (B4) | c40de49 | live: WAVE INBOUND persistent, waste override |
| 6 stats panel (I) | 374c8e0 | `stats.dom.test.ts` + live: rows, curve canvas |
| 7 ?class mode | (see git log) | `reachability.test.ts` class arc wins ≤40 sim-min |
| 8 trading desk | 5c4284a | `positions.test.ts` + live: −$50k margin, close restores, log |
| 9 market events | 7acc2d5 | `events.test.ts`: once-only thresholds, restore |
| 10 blueprints | a92be26 | `blueprint.test.ts` + live: STAMPED 2 — $42000 |
| 11 perf HUD + gate | 20f853f | live: F9 HUD (FPS/TICK/ENT), full check green |

## Deviations from the plan (measured, not assumed)

- **Stats panel key is I, not S** — S is camera-pan-down (WASD, main.ts).
  DESIGN §8 + help overlay updated to match.
- **Help overlay (H) implemented in Task 3** — the plan's §8 contract and the
  build-hint text advertise it but no task built it; minimal static overlay.
- **Positions settle margin + pnl** (`capital += size + pnl`), not plan's
  literal `capital += pnl` — margin is debited at open, so refunding it is
  the only consistent accounting.
- **Task 2's literal `return;` replaced by a guard** — a return from
  renderFrame would skip the overlay render below the tutorial block.
- **Class arc won without the capital-doubling fallback.**

## Next action

Live pass complete (browser, `?debug` + `?class`). Owner review, then push.
