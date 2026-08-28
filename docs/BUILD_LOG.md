# Build log — balance and reachability pass (2026-08-27)

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
