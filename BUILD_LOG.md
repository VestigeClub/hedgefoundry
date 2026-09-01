# Build log — HedgeFoundry (the whole build)

Everything the game became, in order, from an empty repo to the graded URL:
the direction given, what changed, and what was watched to believe it.
2026-08-25 → 2026-09-01, 78 commits (`11d20c5` … `c6740ee`).

How to read it: one section per phase — **prompt** (what the human actually
typed, where the record preserves it; otherwise the scope given), **changes**
(the commits), **verification** (what a human or a camera saw, not just what
compiled). Full mechanical detail lives in `.omp/plans/` and the commit
bodies; user-test protocol and screenshots live in `docs/PLAYTEST.md`;
`docs/DESIGN.md` is the design contract the phases are measured against.
Development model throughout: the human picks scope and GO's launches;
agents implement, test, and produce screenshot evidence; no claim here
without a commit, a test, or a screenshot behind it.

Gate at the shipped tip: `npm run check` — typecheck clean, **176 tests /
26 files**, production build `index-c-Xw1t57.js` (101.8 kB, 35.7 kB gz),
served signed-out at `https://vestigeclub.github.io/hedgefoundry/`.

## Phase 0 — Design before code (2026-08-25)

**Prompt (founding brief):** a Factorio-like real-time factory game reskinned
as a hedge fund — mine market data, process signals, research alpha, survive
finance bros, IPO to win. Class project: must run on Windows, macOS, and in
a browser; built with an AI coding agent; graded on the working deployment,
the source, this log, and a user test.

**Changes:** `11d20c5` repo skeleton (`AGENTS.md` working contract, layout);
`7be3744` `docs/DESIGN.md` v1 (315 lines) — the theme mapping (§4: belts =
ticker tape, turrets = compliance towers, ammo = legal briefs, silo =
roadshow) declared law, systems, relay wire spec (§6), milestones M1–M7.
Stack decided from the browser requirement: custom TypeScript engine,
Canvas2D, Vite, Vitest, zero runtime dependencies.

**Verification:** none possible yet — the rule is that a feature with no
design entry is not ready to build, and this phase is the entry.

## Phase 1 — Milestones M1–M7, one day (2026-08-25)

**Prompt (scope):** build the milestones in `DESIGN.md`, each commit leaving
the game runnable, tests before rendering claims.

**Changes, in order:** `e42da2d` M1 stack + deterministic PRNG (47→0 tests
bootstrapped, gate green); `2e1ce6d` M2 market layer — SSE relay, parser
tested against captured real frames, deterministic SimFeed fallback;
`cba17ab` M3 production core — miner→belt→cleaner chain, capital grid,
brownout, traders, build menu, HUD, inspector (47 tests); `b394550` a
wholesale rewrite of `update.ts` after piecemeal edits corrupted it (the
first recorded agent failure mode, now an `AGENTS.md` rule); `bee3776` M4
research tree, 12 techs (54); `6b442dc` + `cf61e57` M5 finance bros — impact
field, waves, bro AI, towers, hiring, HQ, IPO, win/lose (72); `bad46a6` M6
save/load with autosave; `0754ec3` M6 sound (WebAudio synth, no assets);
`18ba51b` M7 end-game report + `?demo` autoplay cinematic; `9c27165`
edge-triggered panel toggles after held-key flip-flop found by hand.

**Verification:** every milestone commit records its test count; live
browser proofs at M3 (RAW 12 → CLEAN 1 on screen, conservation invariant)
and M4 (researching TAPE SPEED I through the panel); the T-key fix was
verified press-hold-release in the real page via the `__HF` hook.

## Phase 2 — Balance and reachability pass (2026-08-27)

**Prompt (scope):** make the factory run at its designed rates and prove the
game can actually be won, through the player's own verbs only.

**Changes:** `fdfd2b1` — three sim bugs worth more than every multiplier
tried, plus a fuel-ladder repricing; a week's worth of measurement, kept as
**Deep dive A** at the bottom of this log because it is the analytical heart
of the project. Test-count after: 117.

**Verification:** the 50-minute scripted win-attempt run (`reachability`
harness) — 473 hires against the 250 quota but `ipo=none`, recorded as a
failure rather than smoothed over; the five-task user test on the production
bundle (see `docs/PLAYTEST.md`), four passed first try, T4 did not.

## Phase 3 — Submission scaffold, the delivery bug, the win route (2026-08-27 → 28)

**Prompt:** assemble the submission deliverables, then fix what the audit
finds; *"GO on A, don't do anything upstream, fix it locally"* — the last
one sent the context-ceiling repair into `docs/OPERATIONS.md` §8 instead of
touching the lane.

**Changes:** submission scaffold + README truth-pass (`0f2a907`, `7689877`);
invariant tests for the build bar/prices with a mutation proof (`cc856f5`,
`39f9a32`, `68a1d90`); `34625f8` — the F1 revision from the user test: a
refused placement now names the blocker and opens its inspector;
`a2f82ae` — machine output drains every tick, the bug that had made the win
route unreachable (this is what the balance pass could not move);
`d961a7d` IPO siting stops burning its own line; history re-authored for
publication (tree-equality audits `c0c7d8a`–`cd5e405`, scrub commits
`1632f1f`–`febc2fa`); Pages workflow shipped `d4e50a3` — deploys failed
while the repo was private (free plan), which is why going live is its own
phase below.

**Verification:** T4 re-run in the browser: one click, then `X` (before:
four refused clicks and a machine demolished by mistake); the scripted arc
walks to `state=won` once `a2f82ae` lands.

## Phase 4 — End-to-end audit fixes (2026-08-28)

**Prompt:** *"Run a full end-to-end audit of the live game; ranked defects,
no fixes until I pick scope."* The human then picked scope; GO executed
`59b1dd7`–`496420d`.

**Changes:** dead belt lanes drain instead of jamming forever (waste counted
and shown); backpressure honesty; research ledger guard; demo trap exit;
Ctrl+S saves on the player's instinct; camera clamp; inverted keyboard pan
(`50aeda2` — `D` moved the camera LEFT).

**Verification:** per-defect runtime matrix in `99ab78a`; the win overlay
ridden **in a browser** for the first time, with receipts (`a1f2e17`,
screenshots in `docs/PLAYTEST.md`).

## Phase 5 — Feel, art, HUD (2026-08-28)

**Prompt (scope):** the sim is silent and still — make every event punch,
make the map read as a live tape, make the HUD readable by a trader.

**Changes:** `7e30cba` particles, floats, trauma, voices per event;
`6f12508` world art pass; `0183b13` HUD rebuild — stat cards, meters, pills
replacing the one-line stats string.

**Verification:** 142 tests; each pass shown against live play before the
next one built on it.

## Phase 6 — The tutorial (2026-08-28)

**Prompt:** *"I want to add a full-fledged tutorial that is seamless and
that anyone can understand to this game."*

**Changes:** design entry first (`8eace51` §8a), then step engine with
World-predicate triggers (`212e98d`), progress persisted in the save
(`0a3f666`), coach card + pulsing highlight + gating (`5d70ec0`), card
lifted clear of the build bar (`057530d`).

**Verification:** predicate tests per step, not vibes; live advance through
the real build verbs.

## Phase 7 — Gap closure B1–B5 and real depth (2026-08-28)

**Prompt (scope):** the audit list (pause/speed dead code, tutorial bleed
through the loss overlay, undiscoverable demolish, no alerts, no minimap)
plus the depth gaps: trading desk, market events, blueprint, `?class` mode.

**Changes:** `1a25ce4` pause/speed keys; `fe1309c` card hidden on game over;
`706e1c3` demolish hint + help overlay; `5a48465` minimap; `9c0bb24` status
chips; `374c8e0` stats panel; `8f16eb8` `?class` (2× threat clock for the
in-class demo); `5c4284a` trading desk; `7acc2d5` scripted market events;
`a92be26` blueprint; `20f853f` F9 perf HUD.

**Verification:** each shipped live-verified (the plan's execution status,
`c73ea1a`); the class arc wins ≤ 40 class-minutes under the class clock.

## Phase 8 — Polish, production gates, publication (2026-08-29)

**Changes:** `e3bff88` speed keys inert after game over, Escape exits
blueprint; `190bc69` perf HUD gated to dev, blueprint suppresses placement;
anonymization for publication; repo made public and **Pages went live**:
`https://vestigeclub.github.io/hedgefoundry/`, deploy run 33257812779.

**Verification:** signed-out fetch (200, correct page), headless boot on the
graded URL (SIM feed, live HUD); every Actions deploy since runs the full
gate on push.

## Phase 9 — Unfamiliar-user pass (2026-09-01)

**Prompt:** *"Can you audit the game end to end and use headless browser &
vision to play it, catch bugs, errors, inefficiencies… and fix what needs
fixing before submission?"* — plus the owner's report of a real unfamiliar
player who kept losing: confusing loop, a box flashing over the panel, a
tower that "didn't shoot back", and "why are there bitcoin prices?"

**Changes:** `c6740ee` — the four frictions traced to four causes and fixed:
minimap z-order under the inspector; an 11-step tutorial that teaches the
parts that actually kill you (power radius, ammo); towers ship with 4 briefs
(ledgered, conservation test intact) + a dry-tower trouble tip; in-game
instruments renamed FLUX/ORBIT/ZENITH while internal symbols stay stable.
Full findings, repro, and the friction table: **Deep dive B** below and the
`docs/PLAYTEST.md` addendum of the same date.

**Verification:** gate 176/26; live headless repro of the tester's exact
death (starter rounds fired, then dry tower, overrun at wave 10); clean
first-visitor boot on the graded URL showing `THE FUND — YOUR GOAL` with
zero console errors; screenshot `docs/playtest/06-onboarding.webp`.

## Phase 10 — Amber tells, quieted during onboarding (2026-09-01)

**Prompt:** the owner, playing the shipped build: on the placement steps
"two boxes, one yellow one blue, the yellowish one keeps flashing on top of
the blue one."

**Changes:** `c6740ee`..— the yellow was the machine state tells: a
powered-but-starved or jammed machine pulses its glyph/progress bar amber
(`JAM_AMBER`, two different sine frequencies — added by the feel pass as
honest feedback). During the tutorial that pulse fires on exactly the tile
the ring points at and the ghost hovers, so it read as a glitch. While the
card is up the tells now render **static amber**; the flash resumes the
moment onboarding ends (DESIGN.md §8a amended; `H`-help gained a TELLS
legend naming both tells).

**Verification:** live pixel signature on the dev bundle — amber glyph
pixels of a powered-starved cleaner, 11 samples across a pulse cycle:
**186–188 (flat) with the tutorial up**, **187→153→0→157→187 (full sine)
after skip**; gate green (typecheck, 176/26, build `index-BVZSkmck.js`).

## How the agents were used

The pattern is constant: specify → let the agent build → verify on the
running game → fix what the check catches → commit. Three verbatim prompts
represent the many (the full record is `.omp/plans/` and the commit log):

1. *"Plan a full-fledged tutorial that is seamless and that anyone can
   understand."* → design entry first (§8a), then three TDD'd commits —
   which is why the tutorial ships with predicate tests instead of vibes.
2. *"Run a full end-to-end audit of the live game; ranked defects, no fixes
   until I pick scope."* → the 2026-08-28 audit verified live defects and
   **waited**; the human's GO executed them as `59b1dd7`–`496420d`.
3. *"GO on A, don't do anything upstream, fix it locally."* → the
   context-ceiling repair recorded as a transferable lesson in
   `docs/OPERATIONS.md` §8, with identifying details stripped before the
   repo went public.

The failure modes are recorded with the wins, because that is what makes the
log usable: whitespace corruption from piecemeal edits (`b394550`), probes
that looked like defects and were withdrawn after reading the source
(`docs/PLAYTEST.md` bottom), held-key and stale-anchor input traps
(`docs/OPERATIONS.md`), and the one honest gap that survived every pass —
no human has yet completed the tutorial unaided (limitation 1 there).

---

# Deep dive A — balance and reachability pass (2026-08-27)

Scope: make the factory run at its designed rates, price the fuel ladder so
climbing it is a choice rather than a rescue, and prove what the economy can
actually do under scripted play. Everything below is measured by
`src/sim/reachability.test.ts` through the player's own verbs
(`placeEntity`, `tryWire`, `hireBro`, `setResearchTarget`) — no buffers poked,
no capital handed out.

Gate at time of writing: `npm run check` → typecheck clean, **117 tests / 16
files green**, production build 65.7 kB JS (23.7 kB gz). Harness wall clock:
`Duration 20.82s` for the whole suite; the 50-minute scripted run is ~20 s of
it.

## Three sim bugs, each worth more than every multiplier tried

1. **A machine could feed itself.** `pushToAdjacentBelt` would load output into
   the belt on the machine's own input side. That item can never be delivered
   (a machine rejects its own product), so it parked at `pos = 1.00` and
   blocked the lane for the rest of the run. This was the root of every "the
   lab never crafts" symptom. Belt running back into its machine is now
   skipped.
2. **Terminal sinks could refuse.** A cascade cannot balance to the tick (a
   factory makes 0.25 alpha/s, a desk burns 0.125/s) and belts have no
   throttle, so one over-supplied line backed up and froze everything upstream
   permanently — an ammo-full turret stopped every legal printer behind it.
   Research/roadshow/tower now accept and write off surplus.
3. **Richness was consumed as a rate, not a multiplier.** `mapgen` documents
   richness as a 1.0–2.2 multiplier; `updateMiner` used it as tape/s. The whole
   cascade had been running at ~25 % of §5.2 since the first commit. Fixed by
   adding `MINER_BASE_RATE = 4`, derived so a richness-1.8 patch feeds exactly
   one cleaner with headroom for the yield/speed techs.

A fourth, subtler one: a research desk shares one intake pad across both of its
ingredients, so a fast analytics lane could fill all twelve slots and the slow
factory lane was refused — then written off — forever. No ingredient may now
hold more than `ceil(cap / kinds)` of a shared pad.

## Multipliers tried, and why they did not matter

| Attempt | Change | Result |
|---|---|---|
| Price-only pass | clean 100→250, signal 400→900, alpha 1700→3500 | kept — every rung pays back in ~110 s |
| Cleaner-farm stress | 10 clean lines, funded base | clean rung 2.0–2.6 k $/s, no brownout |
| Signal-farm stress | 10 signal lines | signal rung 3.3–4.3 k $/s |
| Richness fix alone | `MINER_BASE_RATE` only, old prices | line still unpayable: 6 clean lines netted +170 $/s against a 44 k signal line (260 s payback) |
| Belt exclusivity in the harness | belts need 1 tile of air, machines may touch | fixed 0.43 σ/s starvation on a 3 σ/s plant |
| Compact-plant ordering | corners by distance to office, not richness | fixed 8 dark desks; power corridors reach |
| Extra lab pairs (3) | buy a second and third research desk | **never placed** — no ground on this map |
| Lab-first ordering | research before any sales line | **margin call at 0.5 min**, capital 0 |
| Bro pacing | cap `24 × (0.5 + evo)`, interval 20 s→4 s | kept — raids arrive, office still falls at 36 |

The pattern: income stopped being the constraint long before the run was won.

> **Superseded 2026-08-28.** The two sections below are the 2026-08-27
> measurement, kept for the record; they are no longer what the game does. The
> arc now closes the IPO at **19.9 sim-minutes** — `state=won`, 250/250 hired,
> $330,808 banked, 543 alpha made, all twelve techs — and the blocker was a
> delivery bug in `updateMachine`, not the price table or the research order.
> See `docs/DESIGN.md` §12b. The ingredient contention found below is real and
> still stands; what it was masking was a machine whose refused output never
> left its buffer, which is why no amount of re-ordering or re-pricing moved it.

## What the script reached before the output-drain fix (2026-08-27)

```
  state=playing at  1.0m hired=0/250   cap=47420  tier=0 min=12 cln=12 ana=2
  state=playing at 20.0m hired=325/250 cap=109842 tier=1 min=21 cln=21 ana=10
  state=playing at 40.0m hired=473/250 cap=34546  tier=1 desk=18/10 bro=36
  state=playing at 50.0m hired=473/250 cap=26672  tier=1 pts=4 ipo=none
```

The economic leg is met and exceeded: **473 hires against a 250 quota**, office
intact, no margin call, brownout never engaged (`multiplier == 1`).

## The gap as it stood that day, recorded rather than hidden

`ipo=none`, and `tier=1` at every single minute-sample of a 50-minute run. The
scripted fund never researches past `fuel-tier-1`, so the alpha economy the
roadshow runs on is never switched on. Cause, isolated by its own test
(`a research desk flooded with signal still researches nothing`): a desk burns
one alpha **and** one signal per craft; the plant's signal is worth 900 $ a unit
to a sales desk, so the lab's own ingredient gets sold and the desk ends the
run holding half a recipe. `pts=4` after 50 minutes is that, not a price table.

Two consequences worth stating plainly: research throughput — not money — is
the strategic ceiling, and a plant can strangle its own tech tree purely by
where it puts a sales desk. §5.5 is the open design question.

## Honest limits of this pass

- ~~No screenshot evidence.~~ Superseded same day: the browser now drives a headless
  Chromium on the production bundle, and the UI changes it could not previously prove
  (error chip, `?debug` gating, `X` refusing the Fund Office, three-case ending copy)
  are verified with screenshots in `docs/PLAYTEST.md`.
- ~~`?demo` autoplay was not re-run after the price change~~ Re-run
  2026-08-28 on the fixed build: the demo rides to **IPO COMPLETE 250/250**
  in ~9.6 minutes of real time and writes no save (see `docs/PLAYTEST.md`
  addendum).
- ~~the economy route to it is the unfinished work~~ Closed: the delivery
  fix (`a2f82ae`, output drains every tick) plus the logistics fixes of
  2026-08-28 take the scripted arc to `state=won` at 19.9 sim-minutes with
  no injected capital. What still owes evidence is a human hand reaching
  the win overlay in a browser — the harness and the demo have, a person
  has not.

## User test and the one revision

Full protocol, per-task results, timings, and screenshots: **`docs/PLAYTEST.md`**.
Summary of the loop, since the assignment is graded on it:

| Stage | Outcome |
|---|---|
| Design | `docs/DESIGN.md` §4/§5; the funding table in §5.2 was the target for this pass |
| Implementation | funding economics re-derived from measurement (3 bugs, see above) |
| User test | five tasks on the shipped bundle; four passed first try, one did not |
| Revision | blocked placement named nothing and selected nothing → now names the blocker and opens its inspector |

The failed task was T4 (diagnose and fix a machine that is not working), and it failed
for a reason no unit test could have found: with a build tool armed a click never
selects, so a refused placement left the player unable to see what occupied the tile —
and the demolish affordance lives inside the inspector they could not open. A
3-wide cleaner flush against a 2-wide desk leaves no tile for the belt between them and
there is no move tool, so this is a routine mistake, not an edge case. Before: four
refused clicks, two tool toggles, one machine demolished by mistake. After: one click,
then `X`. Guarded by `src/ui/build.dom.test.ts`.

Two other candidate findings were withdrawn after reading the source — demolish is
select-then-`X` and refunds exactly half, and per-frame input sampling makes
sub-frame synthetic clicks legitimately invisible. Both were my probe, not the game;
recording them is what keeps the next pass from "fixing" working code.

---

# Deep dive B — unfamiliar-user pass and onboarding rework (2026-09-01)

Prompt: *"Can you audit the game end to end and use headless browser & vision to
play it, catch bugs/errors/inefficiencies, and fix what needs fixing before
submission?"* — plus the owner's report of a real unfamiliar player: he kept
losing, said the loop was confusing, a box flashed over the panel, and the
crypto names meant nothing to him.

Findings verified live (headless Chromium on the dev bundle, `?debug` handle):

- **HF-1** — the minimap (audit B5) sits fixed top-left **under the inspector
  panel**: any selected entity showed a live, repainting box bleeding through
  the panel — the "flashing box" the tester reported. Fixed by z-order
  (`#minimap` z-5 under the opaque panel z-10, `src/style.css`).
- **HF-2** — the tutorial taught the money half of the loop and stopped before
  the parts that actually kill you: **power** (desk/Vault within 7 tiles),
  **ammo** (a tower without briefs cannot fire). Rewritten as eleven steps
  (DESIGN.md §8a): the goal first, then mine → belt → cleaner → funding desk
  → income → armed tower → printer-fed ammo → hire → research, each step
  naming the tool key and the real number.
- **HF-3** — a freshly built tower was silent until an entire printer chain
  existed; wave 1 met no gunfire. Towers now ship with 4 briefs (creation is
  ledgered in `w.totals`, conservation test intact) and `troubleTip` names a
  powered, dry tower ("belt Legal Briefs from a printer into the tower").
- **HF-4** — the tape showed BTC/ETH/SOL prices. In-game labels are now fake
  instruments — **FLUX / ORBIT / ZENITH** (`INSTRUMENT` in `src/sim/world.ts`)
  across ticker, trading desk, positions, and event log; internal symbols
  (wire, saves, relay fixture) stay stable.

Verification: `npm run check` — typecheck clean, **176 tests / 26 files
green**, production bundle `index-c-Xw1t57.js` (101.8 kB, 35.7 kB gz). Live
repro of the tester's death loop on the new build: tower shipped 4/4 briefs,
powered from the vault, fired every round (ammo 4→0, 1 kill), then stood dry
with no printer — overrun at wave 10. That is exactly the hole STEP 7 — AMMO
now closes; screenshot `docs/playtest/06-onboarding.webp`. A powered, dry,
unresupplied tower is now impossible to mistake for a working defense.

Honest limit unchanged: the unfamiliar player is one person, and his session
was post-hoc verbal report, not observed play.
