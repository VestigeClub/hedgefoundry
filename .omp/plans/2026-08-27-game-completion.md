# Plan 0001 — Make HedgeFoundry winnable, playable, and submittable

Date: 2026-08-27. Baseline: `main` @ `e21150f` (pre-re-authoring; the same content is
`5690a0f` on the current `main`), gate green (typecheck + 75 tests + build).
Source: full audit of 2026-08-27 (47 numbered issues; issue numbers referenced below as `#N`).

**Status (2026-08-28, P2 closed in simulation).** Gate green — typecheck clean, **125 tests /
17 files**, build 65.93 kB (23.76 kB gz); CI green on the last pushed tip. Work landed out of the
locked order, via the concurrent implementation session: *"Fix three sim bugs that froze the
factory, and rebalance the fuel ladder"* (belt→desk delivery, `acceptsItem` fuel/alpha branch,
`rollWorking` call, `TECHS` restored to 16, `hireBro`, the `hp <= 0` guard → P1/P2 code), *"Add the
submission scaffold and state the measured horizon honestly"* (→ P6 partial), and now *"Drain
machine output every tick so the win route opens* (→ P2, and the P3 win state with it) and its
follow-up *Stop the IPO siting from burning the line it means to re-site*. Cite those subjects, not
shas — history was re-authored after this line was first written and every sha moved once already
(see the re-authoring block below).
**P2 met.** The scripted 50-sim-minute arc reports `state=won` at **19.9 min**: 250/250 hired,
$330,808 in hand, all twelve techs, 18 miners / 12 analytics engines / 7 strategy factories, 543
alpha made, 94 waves survived. What actually unlocked it was a delivery bug, not balance:
`updateMachine` pushed a machine's output onto tape only on the tick a craft completed, so a single
legal refusal — the research desk caps each ingredient at six units, so a seventh alpha is refused —
stranded those units for the rest of the run, `blocked` never cleared, and the jam walked backwards
until the desk starved holding half a recipe. `logistics.test.ts › retries a delivery the belt
refused once the lane clears` holds the invariant and was verified to fail without the fix. The arc
also needed two money rules a player can read off the panel: a ground budget (18 miner corners on
this map, so the cheap rungs must not eat them all before FUEL TIER II) and a war chest ahead of the
IPO ticket.
**Still open, in order of consequence:** (1) M7 — no human hand has reached the win overlay in a
browser and the cross-platform pass (MacBook Safari) has not been run; (2) P4 onboarding and
legibility; (3) P5 market-feed wiring; (4) splitting the three oversized files
(`reachability.test.ts`, `update.ts`, `world.ts`). Closed since this line was first written:
~~P0 UI liveness~~ (five browser playtest tasks with screenshots, `docs/PLAYTEST.md`), ~~P6
publish~~ (repo `github.com/VestigeClub/hedgefoundry` public, `main` the only ref, Pages deploying
from Actions and live at `https://vestigeclub.github.io/hedgefoundry/`), ~~commit attribution~~
(every commit carries a body and the `Assisted-by:` trailer, and the
internal strings that lived in file contents were scrubbed out of the commits that carried them).
**Next action:** P4, from the commit that lands this line; `git log -1` stays authoritative over any
sha quoted here, and no rate tuning happens before a human playtest says the arc's money rules are
not the game's.

**History re-authored (2026-08-27 23:2x UTC, closes item 4).** All 22 commits rebuilt with
`git commit-tree` plumbing (worktree and index untouched, so concurrent unstaged edits survived).
Every commit message/identity/date pair was checked: the 4-second window at `2026-08-27 11:41:40-43`
was an artifact of a `rebase` that overwrote author dates, and the true times were recoverable
from the pre-rebase objects still reachable via the reflog — the 08-25 session ran 21:47:50 →
23:49:31, which is what the chain now shows. Two messages were reworded: `M2` named an internal
product, `M6/M7` claimed "IPO win verified live" (false, see `docs/BUILD_LOG.md:89-91`). Verified:
HEAD tree hash unchanged (`fe54a72e`), so zero content change; all 22 authors carry the GitHub
noreply address; exactly two subjects differ from the old chain. Rewriting pushed commits means the
P6 push is a delete-and-recreate or a `--force-with-lease` (never bare `--force` — a sibling session
that pushes first must make it fail, not get overwritten). Shas quoted above have now moved twice;
current equivalents, each matched **by tree hash** rather than by narrative: `904a78c` → `fdfd2b1`,
`4ec3a83` → `0f2a907`, and the published tip `e21150f` (same content as `5690a0f`) → `9c27165`.
The superseded line is **no longer tagged** — neither `pre-rewrite` nor its bundle from the earlier
draft of this paragraph exists any more; that chain survives only in a **local archive bundle outside
the published tree** (head `98e7395`, listed by `git bundle list-heads`). Every commit on it, including
`58534da`, `7799e24`, `98e7395`, `814aeb5`, was then re-checked: each has an identical tree
somewhere in the current chain, so no range choice during the rewrite dropped a commit.

**Second history pass (2026-08-27 23:5x UTC) — content scrub + bodies + attribution.** The first
pass reworded messages only; the internal product/host strings were also in *tracked file contents*
of 14 commits (`AGENTS.md`, `README.md`, `docs/DESIGN.md`, `server/relay.mjs`, `src/market/types.ts`).
All 29 commits were rebuilt again with `git commit-tree`, this time writing each revision into a
scratch worktree, running a local scrubber over it, and re-adding before `write-tree`, so the
old blobs are unreachable. The scrubber's rules take their wording from the replacements HEAD
already made, so history converges on text the tip already uses.

Verified, not assumed: a fail-closed gate script rebuilds a known-dirty revision and **fails the pass
unless the tree changes** (it did: `f505bb5a` → `c91545e7`), which proves the loop is live rather
than a no-op; `git grep` for the internal tokens is empty in **every tree** of the chain; every
commit message scores `residual_lines=0`; every commit — the 29 rebuilt ones and the docs commits
added after the pass — carries the trailer with a non-empty body; subjects, author dates and the
single noreply author are unchanged from `pre-attn`; and the rewrite itself changed **zero content at
the tip** — `pre-attn^{tree}` and the rebuilt tip tree are both `50ebe4ce`. Per-commit the story is the
15/14 split below: most revisions kept their tree exactly, 14 were rewritten by the scrub alone.
Bodies came from 21 parallel readers, one per bodyless commit, each restricted to that commit's own diff.

A pairing-audit script prints the pairing itself rather than asserting it: pairing all 29 `pre-attn`
commits to their `HEAD` twins by author-date + subject gives **15 tree-identical pairs, 14 pairs with
differing trees, 0 unmatched**, and every one of those 14 deltas touches only the five scrubbed paths
(file counts 1–5, nothing outside them) — so the scrub is the whole explanation for every tree change.
The same script sweeps the reflog (counts shift as post-pass commits land; final run: 23 entries,
19 not ancestors of `HEAD`, 17 of those holding their exact tree in `HEAD`). The two that do not —
`ad51e12` and `e415f49` "placeholder" — are amended-away predecessors whose content is present in `HEAD`:
the `.scratch/` rule at
`docs/OPERATIONS.md:75`, the `browser.relay`-precedes-`browser.headless` root cause at `:183`/`:192`,
and `deploy.yml` / `LICENSE` / `public/favicon.svg` / `docs/BUILD_LOG.md` all tracked. Nothing was lost.

Backups are **local untracked archives, deliberately outside this repository**, so their paths are not
browsable here; both are `git bundle verify`-clean. One pins the published `main` together with the
pre-attribution tip `219bd58` (its own head, `refs/tags/pre-attn`, listed by `git bundle list-heads`);
the other keeps the pre-scrub chain purely as an archive: no ref in this repository points at it, so
no `--tags` or `--follow-tags` push can publish it. The local tag `pre-attn` was deleted after the push
for exactly that reason — recovery goes through the archive, never through a ref.

## Decisions (locked by owner)

| Area | Decision |
| --- | --- |
| Win reachability | Fix income **and** gate power burn on actual work. Keep the 250-hire quota. |
| Market layer | Keep it, but make it honest: SIM is the default, market frames **drive gameplay** (liquidations → bro surges, cvd → impact), no phantom relay calls. |
| Publish | Personal GitHub account + GitHub Pages, history preserved. |
| Git history | Re-author commit dates from the reflog so the real 2026-08-25/26 chronology shows. |

## Non-negotiable ordering

Economy numbers are meaningless before logistics deliver (`#2`), and balance is meaningless before
burn is charged honestly (`#3`). Sequence is therefore **input → logistics → economy → endings →
onboarding → market → publish → evidence**. Do not tune any rate in `FUNDING_RATES` before P1 exits.

## Baselines to beat (measured, not modelled)

| Metric | Today | Target |
| --- | --- | --- |
| Time to first IPO (autoplay-free, scripted bot) | unreachable | ≤ 40 min sim time |
| Starter line net capital flow | −50 $/s | > 0 $/s |
| Funding desk, fuel supplied | +40 $/s vs 80 $/s fuel burn | net ≥ +60 $/s at T1 |
| Margin call | never fires (10,000 s test, capital 2.96e-322) | fires 10 s after reserve hits zero |
| Hires performable through the UI | 0 | every hire |
| Items destroyed by output overflow | 4 of 8 | 0 (backpressure instead) |
| Console errors on load | 2 | 0 |
| Report fields vs DESIGN §9 | ~1/3 | all |

---

## P0 — Input model and UI liveness  (closes #1 #8 #9 #10 #11 #12 #14)

Everything else is untestable until a click does what it looks like.

- `src/engine/input.ts`: bind `mousedown/mousemove/mouseup/wheel/contextmenu` on the **canvas**, not
  `window`; keep `keydown`/`blur` on `window`. Gate `preventDefault`:
  keydown only when `e.target` is the canvas (or the key is a game key and target is not an
  interactive element); wheel only when `e.target === canvas`.
- `src/ui/build.ts`: convert `update()` to edge-triggered sampling — store `prevKeys: Set<string>`,
  act only on additions (pattern already used at `main.ts:228` for `prevT`). One press arms, next press disarms.
- Rotate on `R` **on the rising edge only**, once per press (`#9`).
- `src/ui/panel.ts` + `src/ui/build.ts` + `src/ui/ticker.ts`: add a render-dirty check (serialize the
  intended HTML to a string, compare with last rendered, skip `innerHTML` when equal). Button nodes
  must survive across frames; `document.contains(buttonRef)` must stay true.
- Add `pointer-events` discipline: overlays that are open must swallow world clicks (belt test below).
- Tests (`src/ui/*.test.ts` are new; use `happy-dom` env for these files only via
  `// @vitest-environment happy-dom`, already configured in `vite.config.ts`):
  - mousedown on `[data-hire]` does **not** clear selection;
  - one `Digit1` keydown+keyup arms exactly one tool; a second press disarms;
  - wheel over `#research` changes `scrollTop`;
  - `Enter` on a focused `#overlay-btn` fires its click.
- **Exit criteria:** scripted browser run hires one analyst through the real DOM, and the build bar
  can be clicked ten times without placing anything.

## P1 — Logistics actually connect  (closes #2 #15 #16 #20)

- `src/sim/production.ts`: add and export
  `inputBuf(e: Entity): ItemBuffer | null` → `e.machine?.crafter.input ?? e.funding?.input ?? e.input ?? null`,
  and `acceptsKind(e, kind): boolean` (belt→belt item; crafter→recipe `in` keys; funding→current fuel
  tier; tower→`brief`; roadshow→`alpha`).
- `src/sim/update.ts`: replace all four delivery sites (`tryBeltExit`, belt-removal push,
  `updateTrader` delivery, `updateTrader` destination check) with `inputBuf` + `acceptsKind`.
  Delete the comment claiming belt delivery to funding is "deferred".
- Backpressure instead of destruction: `Crafter.tick` must stop when `bufferAdd` returns 0 and keep
  the progress fraction (mirror the miner's `rateAcc` hold at `update.ts:90`); `updateTrader` must
  charge only what was accepted (`#20`).
- Jam feedback: `Crafter` gets `blocked: boolean` (true when output full or input starved while a
  recipe is selected); panel renders `JAM: NO SPACE OUT` / `JAM: NO <item>` and the entity draws a
  amber outline (`#16`).
- Tests: miner→belt→cleaner→funding delivers 1 `clean` end-to-end; belt→tower delivers `brief`;
  belt→roadshow delivers `alpha`; output-overflow never increments `totals` for an undelivered item;
  trader charges exactly what landed.
- **Exit criteria:** a hand-built starter line shows `fundingIncomeMs > 0` within 60 s.

## P2 — Economy that pays  (closes #3 #4 #21 #22)

- Burn on work only: `updatePowerGrid` keeps computing coverage, but `demandPerSec` sums
  `burnOf(e)` **only for entities that consumed or crafted in that tick** (`w.working: Set<EntityId>`
  set inside `updateMiner`/`Crafter.tick`/`updateFunding`). Docs already say "while working"
  (`recipes.ts:4`, `world.ts:397`) — code follows the docs.
- Instrument before tuning: add `w.log.demandBreakdown` (dev-only, `?debug`) to settle the measured
  ~800 $/s vs modelled ~45 $/s discrepancy (`#22`) with data, not reading.
- Re-price against the new truth, in this order: fix the anomaly, then `FUNDING_RATES` so T1 nets
  ≥ +60 $/s over the cleaners needed to supply it, then miner/cleaner rates so the DESIGN §11
  starter line is profitable within 90 s.
- Win budget: with `compDiscount-2` the 250-hire ladder must cost ≤ 60 % of a 50-minute best-case
  bank. Implement whichever of {comp ladder, vault capacity, hire quota} the harness says, and
  record the arithmetic in `docs/DESIGN.md` §5.7 so the doc and the number cannot drift again.
- Bro supply: spawn cap must not be the binding constraint — tie cap to `researched` count and HQ
  size rather than to `evolution` alone, so a clean player is not punished (`#21`).
- Permanent tests: `src/sim/economy.test.ts` was never created. The same three contracts live in
  `reachability.test.ts` — the parametrised `ten <rung> lines carry the fund's margin` cases (clean
  2.0–2.6 k $/s, signal 3.3–4.3 k $/s, no brownout) and the arc itself, which cannot win without
  paying the 250-head quota. An older note here quoted "473/250 by the 20th minute"; that arc hired
  past quota, which the win condition does not ask for and which starves the IPO ticket — the
  current arc stops at the quota, 250. All of it drives `tickWorld` directly: no DOM, deterministic seed,
  seconds of runtime.
- **Exit criteria:** the three economy tests pass and the 50-minute harness reports a completed
  IPO. **Met.** `reachability.test.ts › scripted play reaches the IPO inside the 50-minute window`
  ends `state=won` at **19.9 sim-minutes** on the player's own map (seed 11), quota paid and the
  roadshow closed at that same sample, the IPO fed by one alpha line taken off the market. No
  belt speed pumped, no preconditions handed out. The blocker was never the rates: machine output
  was pushed only on the tick a craft completed, so one legal refusal stranded the units and the
  jam walked backwards through the plant (DESIGN §12b).

## P3 — Real endings, honest report  (closes #5 #6 #7 #17 #18 #19 #37)

- Defeat: track `w.zeroReserveMs`; fire margin call when it exceeds 10 s regardless of the
  asymptotic clamp; keep HQ overrun as a separate cause. `w.lossReason: 'margin' | 'hq'`.
- `main.ts` overlay title/summary switch on `lossReason` (`#6`).
- `removeEntity` refuses `kind === 'hq'`; `[X]` on the HQ renders `HEADQUARTERS — NOT DEMOLISHABLE` (`#7`).
- `brosKilled` becomes a real counter incremented in `damageEntity`/`killBro`, never inferred (`#18`).
- `brief-efficiency` becomes data, not a global mutation: recipe lookup takes a `tech` argument
  (`recipeFor(kind, tech)`), delete the `RECIPES.brief` write (`#19`).
- Report (§9): add `hiresByType`, `waves`, `researchOrder`, `eventTimeline`, `pnl: {t, capital}[]`
  (sampled every 5 s, persisted), PNG export via `canvas.toBlob`, and a copy-to-clipboard summary;
  drop `user-select:none` on `#report`.
- Inspector: no `GRID` row for belts/traders (they are never power-gated) (`#17`).
- Tests: margin call fires; HQ survives `[X]`; report contains every §9 field; brief-efficiency
  survives a save/reload round trip.
- **Exit criteria:** a zero-input run ends in ≤ 10 min with the correct title, and a won run renders
  the full report. **Met for the state machine** (`endings.test.ts`, `invariants.test.ts`); the report
  for a *measured* `state=won` run — as opposed to the injected win case — has not been rendered in a
  browser, which is the same gap as M7's playtest pass.

## P4 — Onboarding and legibility  (closes #13 #31 #32 #33 #34 #35 #36)

- Title screen with the objective in two lines and the three win conditions; `NEW FUND` starts the
  run (no silent resume — show `RESUME RUN? [Y]/[N]`).
- Guided first minute: 4 scripted prompts (place miner → belt → cleaner → funding desk), dismissed
  on completion; then an objective strip: `CAPITAL x/$7M · HIRES y/250 · ALPHA z%`.
- Type scale: min 12 px body, 11 px dense rows; every text token ≥ 4.5:1 contrast; fix `#title-chip`
  (add a real `.chip` rule, position it top-left); build bar wraps (`flex-wrap`) below 1000 px and
  the research panel moves to `right: 260px` so it never covers the inspector.
- Pause (`Space`), speed (`1`/`2`/`3` → 1×/2×/4× via `Loop.speed`, which becomes wired), selection
  outline, hover tile highlight, minimap with camera rect and click-to-jump, camera clamp to map.
- Audio: mute toggle; actually play place/deny/research cues; cap concurrent SFX to 2.
- Unhandled exceptions surface as a red HUD line with the message instead of a frozen world.
- **Exit criteria:** an unfamiliar person reaches "funding desk producing" without instructions, in
  under 90 s, on a 1280×720 window.

## P5 — Market layer that matters  (closes #23–#30)

- Delete `relayBase()` guessing. Relay base comes only from `?relay=` (or a `relay.json` next to
  `index.html`); with no base, the client never touches the network → **0 console errors**.
- Absolute 2 s deadline armed at construction; per-frame staleness watchdog; SIM is not terminal
  (redial every 20 s); tape clears on any status change; coin allowlist + bounded DOM.
- Wire frames into the sim (`src/sim/market-events.ts`, new):
  `liq` with `notional_usd` above a threshold → surge bro spawns near the impact cell and log
  `MARKET STRESS: BTC 5.2M liquidation`; `cvd` delta → local `impact` nudge; `candle` → tape
  sparkline; realised vol from `ctx` seeds the map on a fresh run (implements §6 instead of logging it).
- SimFeed fixes: `notional_usd = price × qty` from one draw, epoch-realistic timestamps,
  `funding_hourly` as a slow random walk, `ctx` throttled to 10/s.
- Relay: `server.on('error')`, stream error handlers, argv parsing that matches the header,
  exponential backoff + connect timeout, `deskConnected` from `lastFrameAt`, cached `/seed`.
- Fixture honesty: commit a real slice (≥ 300 frames) with a `scripts/capture.mjs` provenance
  script, or relabel the fixture as hand-authored. No machine-local absolute path anywhere.
- Tests: relay boots on an ephemeral port and answers `/health` + `/stream`; `parseMarketFrame`
  rejects non-positive marks; a synthetic `liq` frame produces bro spawns in the sim.
- **Exit criteria:** on a Pages URL the console is clean, the chip reads `SIM`, and a forced liquidation
  frame visibly spawns bros.

## P6 — Publish  (closes #40 #41 #45 #48)

- Move the repo to the personal account, keep it public, `main` protected by the gate.
- `.github/workflows/deploy.yml`: `npm ci && npm run check && npm run build` → Actions Pages on
  `dist/` (base is already `./`). Add `package.json` `engines: {node: ">=22"}`, `LICENSE` (MIT),
  `favicon.svg`, and a `predeploy` npm script that runs the full gate.
- Sanitise tracked files: LAN endpoint, desk names, personal paths, owner name in `AGENTS.md`.
- `README.md`: one honest quickstart (`npm ci`, `npm run dev`, `npm run check`), the public URL at
  the top, and a "what is simulated vs live" section.

## P7 — Evidence for the three graded items  (closes #42 #43 #44)

- Re-author commit dates from `.git/logs/HEAD`, restore per-milestone granularity, give every commit
  a body and an `Assisted-by:`/`Co-authored-by:` trailer for the agent.
  **Dates + granularity: done** (see the Status note — reflog timestamps were the rebase's, so the
  true times came from the pre-rebase objects; two messages reworded). **Still open:** per-commit
  bodies and an agent-attribution trailer, which this assignment expects; adding them to 22 commits
  is the same plumbing pass, so do it before the force-push rather than after.
- `docs/BUILD_LOG.md` (300–500 words): what the agent produced, the three things it got wrong and
  how they were caught (cite the audit measurements), what was rewritten and why.
- Playtest protocol `docs/PLAYTEST.md`: 5 tasks, timed, no hints; record transcript + one screenshot
  per failure; then **one logged revision** (expected: onboarding copy + funding economics) with
  before/after timings. Keep both in git.
- Commit `.omp/plans/`, `docs/OPERATIONS.md`, and the test harness used for the 50-minute reachability run.

---

## Risks

1. **Balance is the long pole.** P2 can eat the whole budget; the 50-minute harness must be written
   first so tuning is measured, not felt. Budget 3–4 iterations.
2. **P0 touches every UI file** — do it as one commit, revert-on-regression (3 consecutive
   regressions ⇒ revert to best state, per owner rule).
3. **`happy-dom` tests for DOM behaviour add a dev dependency**; if that is unacceptable, cover the
   same contracts with the browser harness instead and say so in the build log.
4. **History rewrite is irreversible** — tag `pre-rewrite-2026-08-27` and keep a bundle backup first.
5. Playtest needs a real human; schedule it before P5 so its findings can still change the game.

## Verification harness (reusable; the traps are recorded so nobody rediscovers them)

`npm run dev -- --port 5175 --strictPort`, then a spawned Chrome via the browser tool with a
throwaway `--user-data-dir`.

- `window.__HF` is only reachable through **CDP `Runtime.evaluate`** (`returnByValue: true`);
  `page.evaluate` runs in an isolated world and reads `undefined`.
- Return objects directly — `returnByValue` already gives `{type, value}`; `JSON.parse`ing it throws.
- No regex literals inside page-evaluate strings (tool transpiler rejects them).
- Synthetic clicks need `mouse.down` → 60–120 ms → `mouse.up`; the game polls input, so an
  instantaneous down+up is invisible.
- A `beforeunload` autosave overwrites `localStorage.clear()`; stub `Storage.prototype.setItem`
  before reloading to force a fresh run.
