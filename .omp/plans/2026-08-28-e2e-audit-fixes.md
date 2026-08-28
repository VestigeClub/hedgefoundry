# End-to-end audit — full defect list and fix plan (2026-08-28)

Status: **EXECUTED (2026-08-28).** Sim fixes commit `59b1dd7`, shell+hygiene
commit `496420d`. Gate: `tsc` clean, 17 files / **131 tests**, build 67.4 kB.
Full runtime matrix re-run live (see Execution log). E1/E2 ceded to the
concurrent docs session (its BUILD_LOG/README/DESIGN edits were in the tree
when this phase started). Decisions as defaulted: void-after-2 s +
`writtenOff` + OUTPUT WASTED chip; minimap deleted; wave pacing untouched.

Method: three static audits (sim core, UI/engine shell, infra — infra audited
personally after the scout collapsed), plus live headless-Chromium probes
against the dev build through `window.__HF`. **LIVE** = reproduced in the
running game this session; **STATIC** = code-verified, not reproduced live.

## Baseline facts (measured, do not re-derive)

- Scripted arc **wins** at HEAD: `scripted play reaches the IPO inside the
  50-minute window` asserts `state=won`, tier≥2, hired≥250 — passes in 11.5 s.
- `?demo` autoplay **reaches the win overlay in a real browser**:
  `IPO COMPLETE — YOU'RE THE FUND · Hired 250/250 · Alpha 10 · Run 9m`
  (screenshot: temp `omp-sshots-1568ddb049b3e465.webp`). Human playtest of the
  full arc remains the one unmet graded item.
- Save/load v2 round-trips exactly (tMs/capital/totals/entities identical
  across reload); corrupt JSON and wrong-version saves are cleared → fresh
  world, no crash. LIVE.
- Margin-call loss works end to end: capital→0 sustained 10 s →
  `lost/margin`, overlay + report render. LIVE.
- Relay down at boot: graceful — refused `/seed` + `/stream`, SIM fallback in
  ~2 s, SSE closed (no retry storm), zero console errors. LIVE.
- Idle/saturated lines bill nothing; jam produces **no** capital bleed
  (demand 0 for 60 s with a destroyed sink). LIVE. (This corrects the static
  claim "miners keep billing while jammed" — billing continues only until the
  output buffer fills, i.e. transient.)
- Perf headroom is fine at small scale: tick 0.022 ms, frame 0.118 ms with a
  live rig. LIVE. Not stress-tested at hundreds of entities.
- Undefended HQ dies to waves ~4.3 sim-min in. LIVE (pace note, not a defect —
  PLAYTEST P0 passed with humans).

## Decisions needed from Zain before Phase A (defaults in bold)

1. **Void policy for items whose sink died** — belt head with no target:
   **void to ground after ~2 sim-s with a ticker "WASTE" note + written-off
   counter**, vs. spill-as-pickable-pile, vs. void instantly.
2. **Minimap** (`src/ui/minimap.ts`, fully implemented, never imported):
   **delete** (no-dead-code rule), vs. wire into `index.html` as a UI win.
3. **Wave pacing** (first wave ~30 s, HQ dead ~4 min undefended):
   **leave as-is**, vs. first-wave grace ~90 s. Balance is DESIGN §11's open
   question; humans passed P0 as-is.

## Phase A — lane correctness (player-facing HIGH)

- [x] **A1. Destroyed sink jams the lane forever. LIVE, worst defect found.**
  Belt head parks at `pos >= 1` when the target entity is gone
  (`update.ts:207-215` + `tryBeltExit` returns false on null/refusing target);
  tail-room fails lane-wide → upstream `blocked=true` → whole line dead for
  the rest of the run. Measured: totals frozen at +30 s and +60 s after
  removing the sink. **Rebuild on the exact tile did NOT heal within 32 sim-s**
  (belt stayed 4/4, head 1.00, cleaner blocked) — root-cause why delivery
  doesn't resume as part of the fix.
  Fix: in `tryBeltExit`, count blocked-at-head ticks per belt; past grace,
  void the item (honor decision 1), and make a rebuilt acceptor drain the
  head on the next tick. Add `w.writtenOff` accounting (also closes Sim#4:
  terminal-sink surplus is today uncounted while `w.totals` counts it).
  Tests: new contract in `logistics.test.ts` — kill fed sink → assert lane
  drains within grace + rebuild heals in 1 tick + totals reconcile with
  `writtenOff`.
- [x] **A2. Multi-belt loop still swallows machine output. STATIC.**
  `update.ts:255-263` rejects only the belt pointing *directly* back; an
  E→S→W run re-entering the pusher passes and dead-ends exactly like the
  fixed self-strand bug. Fix: trace the candidate run ≤ BELT_MAX hops; reject
  if it re-enters the machine's rect. Test: 3-belt loop into a running
  cleaner's own side.
- [x] **A3. Roadshow progress runs backwards. STATIC.**
  `update.ts:590-604` rolls back a whole integer step when alpha is dry, so
  `IPO PROGRESS` visibly decreases at marginal feed. Fix: subtract the
  shortfall, not the integer floor. Test: monotonic `progress` under
  starving feed.
- [x] **A4. Machine output ports are single corner tiles; input accepts any
  edge tile. LIVE (controlled pair).** `pushToAdjacentBelt` probes only
  `(x+w,y)`, `(x,y+h)`, `(x-1,y)`, `(x,y-1)` — one tile per side — while
  `tryBeltExit` delivers to any tile of the target rect (and `canPlace` lets
  a belt sit anywhere legal). Measured: belt one row off the cleaner's east
  port → output 4/4, `blocked=true`, belt empty forever; belt on the exact
  port tile → drains immediately. A player's edge-centered belt is a silent
  permanent jam with a green ghost. Fix (boring option): scan all side tiles
  in `pushToAdjacentBelt` so output symmetry matches input; no UI/ghost
  redesign. Test: east-port row 0 vs row 1 both drain.

## Phase B — research economy (HIGH playability)

- [x] **B1. Re-clicking the selected tech zeroes banked research. LIVE**
  (points 7→0 proven live). `world.ts:266-269` resets unconditionally;
  `ui/research.ts:23` routes every click through it. Fix: early-return in
  `setResearchTarget` when `id === this.researchTarget`. Test in
  `research.test.ts`.
- [x] **B2. Lab bills 40 $/s for wasted crafts on a stale captured target.
  STATIC.** `update.ts:139` marks working; `:149` then discards the point
  (tech finished by another desk mid-craft, or `setResearchTarget(null)`
  path). Fix: don't bill (skip `working.add`) when the produced point is
  discarded. Test: two desks, one tech, assert demand drops with output.

## Phase C — session/shell (player-data safety)

- [x] **C1. Demo mode clobbers the campaign save. LIVE** — canary save was
  gone at `?demo` boot (by design) and rewritten 13 s later with the demo's
  $3.0M world. `main.ts:258` autosave and the beforeunload save have no
  `isDemo` guard. Fix: skip both saves when `isDemo`. Runtime re-check: canary
  survives `?debug&demo`.
- [x] **C2. NEW GAME inside `?demo` re-enters the demo forever. STATIC.**
  Overlay button does `clearStorageSave(); location.reload()` — URL keeps
  `?demo`. Fix: reload to `location.pathname` (drop `demo`/`debug` params).
  Runtime re-check: post-win NEW GAME lands a playable sandbox.
- [x] **C3. Inspector sticks forever on a sim-killed entity. STATIC.**
  `panel.ts:36` stops refreshing once the id leaves `entities`; nothing
  clears `input.selectedId`. Fix: deselect when the selected entity vanishes
  (one guarded line in `renderFrame`).
- [x] **C4. Browser save dialog hijacks gameplay. STATIC.** No Ctrl+S /
  Ctrl+P suppression in `input.ts`. Fix: preventDefault + Ctrl+S = immediate
  manual save (matches player instinct; autosave already exists).

## Phase D — camera & HUD

- [x] **D1. `camera.clampTo` is implemented and tested but never called** —
  players can pan infinitely into void off the 256² map. Wire into
  `renderFrame` (it's already the only missing call site).
- [x] **D2. `#status-chip` swallows canvas clicks. LIVE** (`pointer-events:
  auto`, `z-index: auto`, fixed). Add `pointer-events: none` like `#hud` /
  `#feed-chip`.

## Phase E — repo hygiene + docs (submission surface)

- [ ] **E1. Stale win-state doc. BUILD_LOG §"What the script reaches now"
  + §"The remaining gap" say `ipo=none`/tier-1 plateau — HEAD's arc wins
  (tier≥2, state=won).** The graded evidence file contradicts the passing
  test. Rewrite both sections with the current trace line and keep the
  honest-limits list (no human full run; no Safari).
- [ ] **E2. README test count 125 → actual 124** (or re-state after Phase A–B
  tests land; make it the last docs touch).
- [x] **E3. Delete stray 0-byte `relay.mjs` at repo root** (untracked junk).
- [x] **E4. Dead code** (repo rule violation): `src/ui/minimap.ts` orphan
  (decision 2), `build.ts drawHover` never called, `mapgen.ts:35 FEED_COLORS`
  reserved-empty — all removed. `RECIPE_LABEL` kept exported: `reachability.test.ts`
  imports it, so the export is load-bearing, not dead.
- [x] **E5. Dev-server crash: vite watcher dies on `.scratch` lock files.**
  Observed twice this session (`EBUSY: .scratch/chrome-profile/.../Cookies` →
  watcher `unref()` crash, dev server exits, no error in-app). Fix:
  `server.watch.ignored: ["**/.scratch/**"]` in `vite.config.ts`. This is why
  an earlier session's headless Chromes must be killed before `npm run dev`
  works.
- [x] **E6. Demo header comment says 8×; `DEMO_SPEED = 4`.** Fix the comment.

## Phase F — accepted-as-is (recorded, no action)

- Funding-desk income silently clips at `capitalCapacity()` (Sim#7) — real,
  invisible; note in DESIGN §11 backlog, plus optional "AT CAP" HUD hint as a
  later nicety. The `want===0 → NaN` case is unreachable (loop uses a fixed
  timestep) — verified no-throw live.
- One-tick `demandPerSec` dip after load (Sim#12): free cent-level tick;
  documented, not fixed.
- `updateBros` snapshots `[...entities.values()]` every tick (per-tick alloc;
  perf headroom measured fine).
- `Loop.stop()` after `fatal()` still reschedules rAF once (harmless —
  `tickWorld` is frozen; overlay is DOM). Guard `stopped` when convenient.
- Combat outcome depends on entity insertion order (deterministic but
  spawn-order sensitive).
- First-wave timing / pace (decision 3).

## Execution order and verification

A1 → B1 → C1 → C2 → A4 → D1 → D2 → A2 → B2 → C3 → C4 → A3 → E1–E6 → full
verification: `npm run check` unfiltered; then re-run this session's runtime
matrix headless (rig build, sink-death drain + rebuild heal, research
re-click, canary-save-during-demo, NEW-GAME exit, chip hit-test, clampTo
pan-to-edge, margin loss, corrupt save, relay-down boot) and one human-arc
`?demo` to the win overlay. Commit at every green check; per-file
`npm run typecheck` + targeted `npx vitest run <file>` per AGENTS.md
(edit discipline: `update.ts`/`main.ts`/`world.ts` whole-file rewrite when
the change is multi-function).

Estimated: 15 code fixes (3 of them one-liners), 2 doc rewrites, 5
new/extended test cases, 1 config line. No new files in `src/`.

## Execution log (2026-08-28)


- Commits: `59b1dd7` (A1–A4, B1, B2 + contract tests), `496420d`
  (C1–C4, D1, D2, E3–E6). Pathspec-scoped commits — the concurrent session's
  doc edits and `reachability.test.ts` instrumentation stayed out.
- **A1 void rule discriminates dead vs backpressure** (advisory caught during
  execution): `tryBeltExit` returns `delivered | backpressure | dead`.
  Accepting-but-full holds the head forever — the stall upstream is the
  over-supply signal (the frozen-jam conservation tests pin this). Only no
  target / rejected item type arms the 2 s void. Without this, over-supply
  evaporated product instead of backpressing.
- **The rebuild-heal mystery was a probe artifact**: rebuilt sink on the dead
  lane's tile delivers on the next tick, live and in tests. No extra heal
  mechanism needed.
- Runtime matrix, all live on `?debug`/`?demo&debug` headless: void →
  `OUTPUT WASTED` chip + counted; rebuild delivers next tick; clampTo exact
  (7509.5 = cap); chip hit-test → CANVAS; Ctrl+S `preventDefault` + SAVED
  toast + save written, Ctrl+P swallowed; dead-entity inspector closes; demo
  ran 9.6 min to `IPO COMPLETE 250/250` with **zero** save writes, NEW GAME
  landed `/` fresh world, campaign autosave resumes (t=26 written).
- B2 accepted limitation: only the discarded completion tick is unbilled;
  in-progress craft seconds stay billed (retroactive refund rejected as
  complexity; measurable waste is one tick).
