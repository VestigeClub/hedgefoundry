# HedgeFoundry — Game Design Document

Status: v1.1 (2026-08-27) · Target: school demo, blow away the class.
Stack: custom TypeScript engine, web-first (Windows / macOS / any browser).
Timeline: <2 weeks (M1–M7 below).

---

## 1. Elevator pitch

Factorio, but the factory is a hedge fund. You mine raw market data, clean it,
engineer signals, assemble alpha, fund your capital burn, and survive the
finance bros — hire enough of them and you IPO. Your ticker tape is fed by
**real live market data** when available.

## 2. Design pillars

1. **Every Factorio system has a finance analogue, consistently.** One theme,
   no mixed metaphors. Table in §4 is law.
2. **Logical economy.** Every output has a consumer; every machine has a
   purpose; no fake numbers. Balance table in §11 is the tuning contract.
3. **Live market data is a feature, not a gimmick.** Real BTC/ETH/SOL tape in
   the ticker, real volatility seeds the world, real liquidation events stir
   bro activity. Zero-impact relay from the existing desk server (read-only).
4. **Runs anywhere, zero install.** Browser app. Professor opens a URL.

## 3. Core loop

```
mine Raw Tape → clean → Signals → assemble Alpha
                                      ├→ Research Desk → tech upgrades
                                      └→ Roadshow → IPO → VICTORY
Clean Data/Signals/Alpha → Funding Desk → Capital (powers every machine)
machines emit Market Impact (leaks) → attracts Finance Bros
Bros: HIRE (pay comp → counts to quota) or FIGHT (Legal Briefs from Compliance Towers)
quota + Roadshow + Alpha = IPO
Capital = 0 → margin call → DEFEAT · HQ destroyed → DEFEAT
```

Player loop: expand extraction → watch belts → balance fuel vs burn → expand
research → handle bro waves (hire or fight) → push to IPO before evolution
overwhelms you.

## 4. Thematic mapping (law)

| Factorio | HedgeFoundry | Notes |
|---|---|---|
| Ore patch | **Data Feed** (exchange tape vein) | BTC/ETH/SOL/… patches, richness/vol |
| Mining drill | **Data Miner** | extracts Raw Tape |
| Ore | **Raw Tape** | unprocessed ticks |
| Furnace | **Signal Cleaner** | Raw Tape → Clean Data |
| Iron/copper plates | **Clean Data** | the workhorse item |
| Circuit assembler | **Analytics Engine** | Clean Data → Signals |
| Circuits | **Signals** | indicators, flow, sentiment |
| Science assembler | **Strategy Factory** | Signals → Alpha |
| Science pack | **Alpha** | the end product: return |
| Lab | **Research Desk** | consumes Alpha + Signals → tech |
| Boiler/engine | **Funding Desk** | fuel → Capital (burn/generation) |
| Accumulator | **Treasury Vault** | stores Capital, grid node |
| Power pole | **Treasury Link** | connects grid |
| Belt | **Ticker Tape** | item transport, finance-green |
| Underground belt | **Dark Pool** | passes under obstacles |
| Splitter | **Arbitrage Desk** | split/prioritize flow |
| Inserter | **Trader** | moves items machine↔machine |
| Train/rails | **Market Maker** + **Ticker Rails** | bulk long-haul transport |
| Gun turret | **Compliance Tower** | fires Legal Briefs |
| Ammo | **Legal Brief** | cease-&-desist ordnance |
| Ammo assembler | **Legal Printer** | Clean Data + Signals → Briefs |
| Rocket silo | **Roadshow** | consumes Alpha → IPO launch |
| Pollution | **Market Impact** (leaks) | spread field, attracts bros |
| Biters | **Finance Bros** | waves, evolution, raid |
| (none — new) | **Hire Desk** (UI action) | pay comp, absorb bros → quota |
| Launch rocket | **IPO launch** | victory |

## 5. Systems

### 5.1 Extraction — Data Feeds & Miners
- **Data Feed** patches carry **richness**, a **1.0–2.2 multiplier** on the
  drill's base rate — not a raw yield/s — and volatility (visual flicker,
  bro-attract multiplier).
- **Data Miner** (2×2): 1 patch. Accumulates
  `MINER_BASE_RATE × richness × yieldMult × speedMult` Raw Tape per second,
  `MINER_BASE_RATE = 4` (`src/sim/update.ts`), chosen so a richness-1.8 patch
  feeds exactly one Signal Cleaner (1 clean/s, §5.3) with headroom for the
  yield and speed techs. Upgradeable via research: speed, yield.
- Raw Tape has no other source. Miners need Capital + grid connection.
- **Throughput is limited by logistics, not by the drill.** A belt accepts the
  next item only once the tail has cleared `BELT_SPACING`, so one
  default-speed lane carries roughly 3–6 items/s regardless of how fast the
  machine above it produces, and a starved drill zeroes its accumulator
  rather than banking tape. A line is sized by its narrowest lane.

### 5.2 Logistics — Tape, Dark Pools, Arbitrage, Traders, Market Makers
- **Ticker Tape** (1×1 belt): 2 lanes (left/right, finance-tape style), items
  flow; speed research. Max ~15 items/s/lane at T0, scaling with research.
- **Dark Pool** (underground): 2–6 tile span, 1×1 entry/exit.
- **Arbitrage Desk** (splitter): 2-in/2-out, output priority, input priority.
- **Trader** (inserter): 1×1 arm; variants by speed/range (Analyst Trader,
  Senior Trader, Quant Trader). Picks from belt/building, places into
  machine/belt.
- **Market Maker** (train): 2×4 engine + cars; carries Clean Data/Signals in
  bulk between distant stations (Feed Depots, Factory Hubs). Ticker Rails
  (2-wide). Requires research to unlock. *M6, cuttable if time pressure.*

### 5.3 Processing chain
Rates below are the shipped `RECIPES` (`src/sim/recipes.ts`): one machine of
each stage balances the next one exactly, so a chain is `miner → cleaner →
analytics → factory` with no buffer games.

| Machine | Size | Input | Output | Base rate |
|---|---|---|---|---|
| Data Miner | 2×2 | — (patch) | Raw Tape | 4/s × richness (1.0–2.2) |
| Signal Cleaner | 3×3 | Raw Tape 1 | Clean Data 1 | 1.0/s |
| Analytics Engine | 3×3 | Clean Data 2 | Signals 1 | 0.5/s |
| Strategy Factory | 3×3 | Signals 2 | Alpha 1 | 0.25/s |
| Legal Printer | 2×2 | Clean Data 1 | Brief 2 | 0.5/s |
| Research Desk | 3×3 | Alpha 1 + Signals 1 | (consumed) | 0.125/s |

Two rules make those rates behave in a real plant:
- **No ingredient may fill a shared intake.** A pad is a queue for every input
  a recipe starts from, so each one gets `ceil(cap / kinds)` slots. Otherwise a
  fast analytics lane packs all twelve slots of a research desk and the slow
  factory lane is refused forever — a desk holding only half a recipe never
  crafts, and the lab silently stops researching.
- **Terminal sinks write off surplus.** Research points, IPO alpha and tower
  ammo are consumed, never resold, and a cascade cannot balance to the tick,
  so a full sink accepts and discards rather than backing its belt up and
  freezing every machine upstream of it.

All machines: fixed craft recipe, no quality tiers (v1), a 12-slot input pad
per ingredient share and a 4-slot output buffer.

### 5.4 Capital — the power system
- **Funding Desk** (2×2, the "boiler"): consumes fuel → Capital. It sells the
  fuel rather than burning it: it accepts whatever the current fuel tier
  prices, at that tier's `ratePerSec`, and pays `price × seconds of fuel`
  (§5.6). Fuel tiers unlock via research:
  - T0: Clean Data — 1.0/s at 250 $ = 250 $/s
  - T1: Signals — 0.5/s at 900 $ = 450 $/s
  - T2: Alpha — 0.25/s at 3,500 $ = 875 $/s
- **Treasury Vault** (2×2, accumulator): stores Capital, raises the bank cap.
  Grid node.
- **Treasury Link** (1×1 pole): range 7 tiles, connects machines to grid.
- Every machine has **burn** (Capital/s): Miner 10, Cleaner 20, Analytics 30,
  Factory 60, Printer 15, Desk 20, Tower 25, Funding 0 (net producer).
- **Grid**: a machine is powered iff linked (manhattan ≤7 through links/vaults)
  to ≥1 vault/funding desk with stored Capital.
- **Brownout**: total burn > total Capital production+reserve → all machines
  scale production by `reserve_ratio` (Factorio-style power shortage). UI
  alarm: `CAPITAL DEFICIT`.
- **Margin call**: Capital reserve = 0 for 10 s continuously → fund liquidated
  → **DEFEAT**. Brief grace alarm at 5 s.

### 5.5 Research — the tree
The Research Desk crafts the "research" recipe (1 Alpha + 1 Signal per craft,
10 s); each completed craft adds one point toward the SELECTED tech (set via
the research panel, key T). At the tech's cost in points it applies and the
desk moves on. Desk idles without a target. Current tree (12 techs):
1. **Extraction**: Miner Speed I (+25% rate), Miner Yield I (+10% patch yield)
2. **Processing**: Cleaner Speed I, Analytics Speed I, Factory Speed I (+25% each)
3. **Logistics**: Tape Speed I/II (+25%/+50%), Trader Speed I (+25%)
4. **Funding**: Fuel Tier I (burns SIGNALS · 160 CAP/s), Fuel Tier II (burns
   ALPHA · 600 CAP/s), Vault Capacity I/II (+50K reserve each)
5. **Defense** (M5): Compliance Range I, Tower Damage I/II, Brief Efficiency
6. **Hiring** (M5): Comp Discount I/II (−15%/−30% hire comp)
7. **Markets** (M6): Market Maker I (trains)

### 5.6 Market Impact — the pollution analog
- Every running machine emits **Impact** (per burn unit: 1 Impact/s per 10 burn).
- Impact spreads on a coarse grid (like Factorio pollution), decays
  exponentially. **Leaks** = accumulated impact in a region.
- Impact drives: bro attraction (rate at which bros path to you) and bro
  **evolution** (cumulative impact + time + waves cleared).
- Visual: faint red/amber haze over impacted tiles; alarm at high values.

### 5.7 Finance Bros — the enemy
- **Spawning**: bros spawn at map edges/"rival funds" (bases). Wave cadence
  scales with evolution; a burst event fires when real-market **liq** bursts
  arrive (live mode) or synthetic stress events (sim mode).
- **Attraction**: bros gravitate to the highest-impact regions, then home on
  the Fund Office. **Targets are the office and the compliance towers only**
  (`BRO_TARGETS`, `src/sim/update.ts`): impact decides where a bro walks,
  never what it may chew, so field machines are immune and a raid costs you
  defence and the office.
  - **Open question**: the original design had bros chewing machines, which
    is what made expansion cost something. With machines immune, a base can
    grow without its plant ever being at risk, and the only pressure is the
    office wall. Decide deliberately whether to re-open machine damage.
- **Types** (scale with evolution):
  - **Analyst** (small, fast, 20 HP, 2 dmg)
  - **Trader** (medium, 60 HP, 6 dmg)
  - **Managing Director** (big, 200 HP, 15 dmg, slow)
  - **Quant** (elite, 400 HP, 25 dmg; end-game)
- **Hiring** (the core novelty): click a bro → Hire (pay comp in Capital) or
  it's fought by towers. **Hired bros leave the raid, count toward the IPO
  quota, and each gives +0.5% alpha output globally** (they run the factory).
  Comp scales with type + evolution.
- **Compliance Towers** (2×2): fire Legal Briefs (2/s, range 12, damage 8).
  Need ammo from Legal Printers + belts. Bro death = brief consumed
  (no drops).
- Defense techs (M5): Compliance Range I (+4 tiles), Tower Damage I/II
  (+8/+16), Brief Efficiency (printers output 3).
- Hiring techs (M5): Comp Discount I/II (−15%/−30% hire comp).

### 5.8 Victory — the IPO
- **Roadshow** (4×4, the rocket silo): burns Alpha until the IPO closes.
  Build cost $120k (`COSTS.roadshow`), and it bills power whether or not it is
  fed (`ALWAYS_ON`).
- **Quota**: 250 hired heads (`HIRE_QUOTA`), shown as `BROS HIRED 137/250`.
  Hiring is the win condition **and** the cheap defence: a bro converted at
  the wall costs its comp once — there is no ongoing salary — so 250 heads is
  roughly $1.1M of comp, less `comp-discount-2` (≈ $770k).
- **Alpha requirement**: 40 units delivered (`ROADSHOW_ALPHA_NEEDED`), at
  ≈ 0.89/s so about 45 s of sustained delivery. Alpha needs no research to be
  *delivered* — the roadshow takes it at any fuel tier — so the IPO is gated
  on plant, cash and survival, not on the tech tree.
- Quota + 40 alpha ⇒ **IPO launch** sequence (countdown, ticker frenzy,
  confetti of green candles) → victory screen + **end-game report** (§9).

### 5.9 Defeat
- Margin call (Capital = 0 for 10 s) → liquidation screen.
- HQ destroyed: the player starts with a **Fund Office** (4×4); bros target
  it preferentially; HP 500; destroyed → defeat screen.
- Both screens show the report + `NEW GAME` / `LOAD`.

## 6. Live market integration (the wow) — read-only desk relay

Source: a **user-supplied market-data server**, addressed entirely by
configuration — `DESK_WS` (WebSocket stream) and `DESK_REST` (candle pulls for
`/seed`), see `.env.example`. There is no hard-coded host anywhere in the repo;
unset both and the game runs on its own deterministic feed.
**Read-only: the relay only consumes; the upstream server is never modified.**

Relay picks the **L1 subset only** (nothing with crazy depth):

| ch | frame shape | use in game |
|---|---|---|
| `ctx` | `{coin, mark, oi_base, oi_usd, funding_hourly, ts_ms}` (~11/s) | **ticker tape**: live mark prices per coin |
| `candle` | `{coin, tf:"1m", bar:{t,o,h,l,c,v}}` (~7/s) | tape sparklines; world-seed volatility |
| `cvd` | `{coin, venue, bucket:{t,buy_usd,sell_usd,delta_usd,cvd_usd,session_start_ms}}` (~4/s) | flow flavor, impact events |
| `liq` | `{event:{t,coin,venue,side,price,qty,notional_usd,…}}` (bursty) | **bro burst trigger**: real liquidation storms spawn extra bros |

Dropped: `book`, `bookheat` (L2 depth), `whale` (too heavy + gated), `brief`,
`fbar`, `agent`, `health`, `watch`.

```
market-data server (DESK_WS, read-only WS) ──► server/relay.mjs (Node 24, zero-dep)
                                            │  :7891/stream  SSE — L1 live passthrough
                                            │  :7891/seed    realized vol, 2d 1m candles
                                            │  :7891/        serves dist/ statically
                                            ▼
                                  browser game client
                                  └─ relay silent >2 s → embedded SimFeed (same wire)
```
**Relay** (`server/relay.mjs`, Node 24, zero-dep): one read-only WS client to
`DESK_WS` (broadcast-all — the upstream is built for multiple consumers);
filters to the L1 subset; re-serves as **SSE** (`/stream`) so the browser needs
no WS handshake. Also serves `/seed` (realized vol from 2 days of 1m BTC
candles — `{coin,tf,bars:[{t,o,h,l,c,v}]}`) and `dist/` statically (LAN demo =
one process). Every relay frame carries `src: "live"`. If the relay is
unreachable or silent for 2 s, the **client falls back to its embedded
deterministic SimFeed** (`src: "sim"`) — a demo never depends on the LAN, and
neither the host nor the port of the upstream is known to the game.
- Game wire format (game-defined, one JSON line per frame):
  `{"src":"live","ch":"ctx","coin":"BTC","mark":77152.0,"funding_hourly":0.00011,"ts_ms":…}`
  `{"src":"live","ch":"candle","coin":"BTC","tf":"1m","bar":{"t":…,"o":…,"h":…,"l":…,"c":…,"v":…}}`
  `{"src":"live","ch":"liq","coin":"BTC","venue":"binance","side":"buy","price":…,"notional_usd":…}`
World seeding: on new game the client calls the relay's `/seed`, which fetches
`GET /api/candles?coin=BTC&tf=1m` (2 days) → realized vol → map
richness/volatility distribution + starting ticker values. Relay down →
client uses its fixed sim seed values — no server needed anywhere.
- UI: `LIVE` / `SIM` chip; live mode shows real coin marks on the tape; bro
  burst events labeled `MARKET STRESS: BTC 5.2M liquidation`.

## 7. World generation
- 256×256 tiles, toroidal-free, wrap edges with "wall" (no). Start area safe
  (no bro bases within 40 tiles).
- Terrain: floor = dark grid; obstacles: **stale pools** (rock-like,
  impassable), **regulatory walls** (cliffs, cuttable later) — v1: stale
  pools only, sparse.
- Data Feed patches: 8–14, sizes 4–12 miners, random walk shapes.
- Bro bases ("rival funds"): 4–8 at distance 80–180, evolving; destroyed base
  = fewer spawns (biter-nest analog, optional v1).
- Seeds: world seed + market seed → reproducible.

## 8. Art direction & UI — quant terminal dark
- Palette: near-black `#0A0E14`, panel `#0F1620`, grid `#13202E`; accents
  green `#00E68C` (up/belts), red `#FF3B5C` (down/damage), amber `#FFB300`
  (alarms), cyan `#00C8FF` (info/selection). Glow: `shadowBlur` sparingly
  (perf), pre-rendered sprites.
- Type: monospace (system fallback stack: `JetBrains Mono, IBM Plex Mono,
  Consolas, monospace`; no webfont dependency → offline-safe).
- Entities: code-drawn vector sprites (rounded rects + glyph marks), each
  entity has a 1-letter/label chip (miner `M`, cleaner `CL`, …) — readable at
  zoom.
- Chrome (CSS overlays + canvas):
  - Top: **ticker tape** (real marks in LIVE mode), game speed, pause.
  - Top-right: Capital, burn, Impact level, `BROS HIRED n/quota`, evolution %.
  - Bottom: build menu (hotkeys 1–9), status line (`CAPITAL DEFICIT`,
    `WAVE INBOUND`, `IPO READY`).
  - Right: selected-entity panel (recipe, buffers, grid status).
  - Minimap (top-left, 96px).
  - `LIVE`/`SIM` chip top-right; `v0.x` build chip.
- Zoom 0.5–3, pan with WASD/edge/middle-drag, tile highlight hover.

### 8a. Onboarding tutorial

Seamless, event-driven onboarding — a bottom-left **coach card** plus a canvas
highlight, never a modal wall. Shown on a fresh world with no buildings when
no save is resumed; never in `?demo`. Skippable; skip is remembered in the
save. Progress persists as an optional save field (`tutorial?`, no version
bump — same convention as `writtenOff?`). Steps advance only when the player
does the thing; each `done` predicate reads `World` state. The engine
(`src/tutorial/`) checks triggers at ~10 Hz; every quoted number is from §11.

| # | Card title | Trigger (`done` on World) | Highlight |
|---|---|---|---|
| 0 | WELCOME TO THE FUND | camera moved ≥ 0.5 tiles or 12 s | HQ |
| 1 | FIRST EXTRACTION (`1`) | a `miner` exists | nearest feed patch |
| 2 | MOVE THE TAPE (`0`) | a `belt` adjacent to a miner | the miner |
| 3 | CLEAN IT (`2`) | a `cleaner` exists | cleaner spot |
| 4 | FUND IT (`7`) | a `funding` exists | funding spot |
| 5 | MONEY FLOWING | capital trough + $10k | — |
| 6 | DEFEND (`e`) | a `tower` exists | HQ |
| 7 | HIRE | `hired ≥ 1` | nearest bro, else HQ |
| 8 | RESEARCH (`T`) | `researchTarget !== null` | research panel |
| 9 | GO BIG | click-through → done forever | — |

Presentation: pulsing cyan (`#00C8FF`) world-space ring on the existing
canvas; chain diagrams as inline HTML chips; failure-aware one-line trouble
tips (brownout / starved line) reuse the same card slot. Card copy is
finance-native, ≤ 2 lines body.

## 9. End-game report (victory AND defeat)
Full-screen report: AUM/capital curve, production totals per item, bros hired
by type, waves survived, research tree filled, timeline of key events, final
P&L. Exports as PNG (canvas capture) + copyable text. This is the
"assignment-grade" artifact.

## 10. Tech architecture
- **Stack**: TypeScript strict, Vite (dev+build), Vitest (logic tests), zero
  runtime deps. Node 24 for the relay (`server/relay.mjs`, zero-dep: global
  WebSocket + http).
- **Sim**: fixed-tick 30 Hz, deterministic (seeded RNG, sorted iteration).
  Render at rAF, interpolate (belt positions, bro movement) — no sim
  dependence on frame rate. Pause / 1× / 2× / 4× speeds.
- **Modules** (`src/`): `engine/` (loop, camera, input, render, grid, sprites)
  · `world/` (mapgen, tiles) · `items/` · `entities/` (registry + per-type) ·
  `sim/` (tick, production, power, impact) · `market/` (feed client, types,
  sim-feed) · `bros/` (waves, pathfind, hire) · `research/` · `ui/` (hud,
  ticker, panels, build) · `save/` (serialize to localStorage + JSON export).
- **Save/load**: full sim state JSON (items, entities, research, bros,
  market state) → localStorage + export/import file. Save on pause menu.
- **Determinism**: no `Math.random` in sim (seeded PRNG everywhere); floating
  point only where rendering needs it (positions interpolated on render).
- **Perf targets**: 512×512 map, ~500 entities, 10k items on belts, 60 fps on
  a mid laptop; culling, pre-rendered tile chunks, batched sprite draw
  (offscreen canvas per sprite, single drawImage pass per layer).

## 11. Balance table (v1 — the tuning contract, measured)
Every number below is what the code ships (`src/sim/{world,recipes}.ts`); the
payback rows are measured by `src/sim/reachability.test.ts`, not estimated.

- **Start**: $400k capital (`STARTING_CAPITAL`) — a starter base *or* the lab
  pair (~139k), so the first decision is production versus research. Bank cap
  2M, +250k per vault (`VAULT_CAPACITY`); never binding at these incomes.
- **Costs**: Miner 4k, Cleaner 8k, Analytics 20k, Factory 45k, Printer 12k,
  Research 30k, Funding 12k, Vault 6k, Link 2k, Belt 800, Trader 4k,
  Tower 15k, Roadshow 120k.
- **Fuel prices** (a desk sells its fuel, it does not burn it): clean 250,
  signal 900, alpha 3 500. Priced so every rung of the ladder returns its
  build cost in about the same time — that is what makes the choice one of
  scale rather than of survival:

| Rung | Line cost | Gross | Net | Payback |
|---|---|---|---|---|
| clean (miner→cleaner→desk) | 24k | 1.00/s × 250 | +220 $/s | 109 s |
| signal (+ analytics) | 44k | 0.50/s × 900 | +390 $/s | 113 s |
| alpha (+ factory) | 89k | 0.25/s × 3 500 | +755 $/s | 118 s |

  Measured on ten-line farms under the harness: clean 2.0–2.6 k $/s, signal
  3.3–4.3 k $/s, no brownout (`w.multiplier == 1`).
- **Hiring is the money sink and the win gate**: comp is charged **once** per
  head (analyst 4k, trader 10k, MD 25k, quant 50k, less `comp-discount`
  −15 %/−30 %) and there is no ongoing salary. 250 heads ≈ $1.1 M, ≈ $770 k
  with both discounts. The old note claiming "$5 M+ in comp against a $1 M
  ceiling" was wrong about both numbers.
- **Research** is the strategic ceiling, not money: one desk burns 1 alpha +
  1 signal per 8 s = 0.125 points/s against a route of roughly 200 points, so
  a single desk is ~25 minutes of a 40-minute run. Extra desks need ground,
  power and an alpha feed each.
- **Bros**: live cap `round(24 × (0.5 + evolution))` — 12 at evolution 0, 36 at
  1; wave interval eases 20 s → 4 s; +7e-5 evolution per point of impact.
  Comp as above. Raids cost the office and the towers (§5.7).
- **Tuning method**: the Vitest harness plays scripted optimal money rules and
  asserts the ladder is net-positive and the quota payable.
- **What the harness caught, in order**: the run first plateaued at fuel tier
  1, which reads like a research-throughput problem and was not one (§12b:
  delivery, not rates). With that fixed the binding constraints are ground and
  threat. Laid in straight rows, the map gave the script 21 miner corners before
  the ground ran out — a fund that spends them on the cheap rungs has no room
  left for the alpha lines the roadshow needs (the build that wins sits 18
  miners and 7 factories); and comp paid past the 250-head quota buys nothing
  but a permanent hole in the cash that buys off the next raid.

## 12. Milestones (2 weeks, from 2026-08-25)
- **M1 (d1–2)**: stack up (Vite+TS+Vitest+gate), engine core (loop, camera,
  zoom/pan, canvas grid render), build gate `npm run check`.
- **M2 (d3)**: market layer — relay.mjs (live+sim), wire tests, ticker tape
  UI, LIVE/SIM chip, world-seed from candles.
- **M3 (d4–6)**: production chain (feeds→cleaners→analytics→factories→alpha),
  tape/dark pool/arbitrage/traders, funding+vault+links grid, brownout,
  build menu + entity panels. *Core demo beat.*
- **M4 (d7)**: research tree, legal printers + briefs, compliance towers.
- **M5 (d8–9)**: bros — impact field, waves, flow-field pathing, hire UI,
  quota, HQ, margin call, IPO roadshow + countdown, defeat screens.
- **M6 (d10–11)**: trains (Market Makers) if green; save/load; art pass
  (sprites, glow, ticker polish); sound (WebAudio blips, alarms, ambience).
- **M7 (d12–14)**: end-game report, demo mode (scripted auto-play + camera
  flythrough), cross-platform verification (Windows Chrome/Edge, MacBook
  Safari/Chrome, professor browser), README play guide, presentation assets.

## 12b. Shipped status (2026-08-27 →)
- **Done**: M1–M6 sim + UI (production chain, belts/traders, power/brownout,
  research, bros/impact/defense, hire, HQ, margin call, roadshow build,
  end-game report with capital sparkline), live market relay (L1 read-only)
  with client-side SimFeed fallback, autosave + resume, WebAudio synth SFX,
  `?demo` cinematic autoplay, README play guide.
- **Not done**: M7's cross-platform pass (MacBook Safari, the professor's
  browser). Everything else in §12 has a measured run behind it.
- **Gate**: `npm run check` = typecheck + 125 Vitest tests (17 files) + Vite
  build, all green.
- **Proven by simulation** (`src/sim/reachability.test.ts`): each production
  rung is net-positive (clean 2.0–2.6 k $/s on a ten-line farm, signal
  3.3–4.3 k $/s), and a scripted fund — build, defend, expand, hire — pays
  its 250-head quota, holds the office and **closes the IPO at 19.9 sim
  minutes** of a 50-minute window: `state=won` with 18 miners, 12 analytics
  engines and 7 strategy factories, all twelve techs researched, $330 k in
  hand and 543 alpha made. No capital is injected and no belt speed is
  pumped; the script spends only money the panel says it has.
- **What was actually stopping it**, recorded because the first diagnosis was
  wrong. It was not research throughput and not sales desks buying the lab's
  signal: `updateMachine` emptied a machine's output buffer only on the tick a
  craft completed, so one legal refusal — the research desk caps each
  ingredient at six units, so a seventh alpha is refused — stranded those
  units for the rest of the run. `blocked` never cleared, the machine's own
  input filled, and the refusal walked backwards: the factory jammed and
  stopped buying signal, the analytics engines jammed behind it, and the desk
  starved holding half a recipe. The output now drains every tick, so a jam
  that clears restarts the line by itself, and `src/sim/logistics.test.ts`
  holds that invariant against a future regression.
- `src/sim/endings.test.ts` still covers the ending state machine rather than
  the win: its case injects $50M of capital, hand-loads the roadshow's alpha,
  assigns `hired = HIRE_QUOTA` and `progress = NEEDED - 1` outright, then
  ticks twice. The reachability arc is the case that earns all four.
- **Cross-platform**: any browser opens `http://<host>:7891` (relay serves
  `dist/`); zero install. macOS browser check pending.

## 13. Non-goals (scope guard — v1)
No fluids/derivatives, no logistics bots, no circuit network, no blueprints,
no multiplayer, no mobile. Anything from this list only after M7 is green.

---

*Change procedure: design changes land here first, then code. Every system
touched must keep §4 mapping consistent.*
