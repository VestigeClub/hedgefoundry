# HedgeFoundry — Game Design Document

Status: v1 (2026-08-25) · Author: Zain + agent · Target: school demo, blow away the class.
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
- **Data Feed** patches generate Raw Tape; richness (yield/s) and volatility
  (visual flicker, bro-attract multiplier) vary per patch.
- **Data Miner** (2×2): 1 patch, outputs Raw Tape to tape/building. Upgradeable
  via research: speed, yield.
- Raw Tape has no other source. Miners need Capital + grid connection.

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
| Machine | Size | Input | Output | Base rate |
|---|---|---|---|---|
| Data Miner | 2×2 | — (patch) | Raw Tape | 1.0/s |
| Signal Cleaner | 3×3 | Raw Tape 1 | Clean Data 1 | 0.5/s |
| Analytics Engine | 3×3 | Clean Data 2 | Signals 1 | 0.33/s |
| Strategy Factory | 3×3 | Signals 3 | Alpha 1 | 0.2/s |
| Legal Printer | 2×2 | Clean Data 1 + Signals 1 | Brief 2 | 0.5/s |
| Research Desk | 3×3 | Alpha 1 + Signals 1 | (consumed) | 0.1/s |

All machines: fixed craft recipe, no quality tiers (v1), buffer of 1 craft.

### 5.4 Capital — the power system
- **Funding Desk** (2×2, the "boiler"): consumes fuel → Capital at fixed rate.
  Fuel tiers unlock via research:
  - T0: Clean Data (cheap, inefficient: 2/s → 40 Capital/s)
  - T1: Signals (4/s → 160 Capital/s)
  - T2: Alpha (2/s → 600 Capital/s)
- **Treasury Vault** (2×2, accumulator): stores Capital (cap 50k base, research
  +capacity). Grid node.
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
- **Attraction**: bros path (flow-field on tile grid, throttled) toward
  highest-impact regions → HQ and machines. Attack: chew machines down
  (HP), destroy on 0 → machine wreck (remove entity).
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
- **Roadshow** (4×4, the rocket silo): consumes Alpha (1/s) + requires hired
  quota reached (250 bros). Build cost: $2M.
- Quota check: top-bar progress `BROS HIRED 137/250`.
- When Roadshow delivers its Alpha requirement (400, at 4/s ≈ 100 s of
  sustained delivery), **IPO launch**
  sequence plays (countdown, ticker frenzy, confetti of green candles) →
  victory screen + **end-game report** (§9).

### 5.9 Defeat
- Margin call (Capital = 0 for 10 s) → liquidation screen.
- HQ destroyed: the player starts with a **Fund Office** (4×4); bros target
  it preferentially; HP 500; destroyed → defeat screen.
- Both screens show the report + `NEW GAME` / `LOAD`.

## 6. Live market integration (the wow) — read-only desk relay

Source: the configured market-data server at `ws://desk-host:5299/ws/stream`
(verified live 2026-08-25, 12 channels, feeds healthy, zero warnings).
**Read-only: relay only consumes; the desk is never modified.**

Relay picks the **L1 subset only** (user directive: nothing with crazy depth):

| ch | frame (verified from the wire capture) | use in game |
|---|---|---|
| `ctx` | `{coin, mark, oi_base, oi_usd, funding_hourly, ts_ms}` (~11/s) | **ticker tape**: live mark prices per coin |
| `candle` | `{coin, tf:"1m", bar:{t,o,h,l,c,v}}` (~7/s) | tape sparklines; world-seed volatility |
| `cvd` | `{coin, venue, bucket:{t,buy_usd,sell_usd,delta_usd,cvd_usd,session_start_ms}}` (~4/s) | flow flavor, impact events |
| `liq` | `{event:{t,coin,venue,side,price,qty,notional_usd,…}}` (bursty) | **bro burst trigger**: real liquidation storms spawn extra bros |

Dropped: `book`, `bookheat` (L2 depth), `whale` (too heavy + gated), `brief`,
`fbar`, `agent`, `health`, `watch`.

Architecture:
```
the desk (desk-host:5299, read-only WS) ──► server/relay.mjs (Node 24, zero-dep)
                                            │  :7891/stream  SSE — L1 live passthrough
                                            │  :7891/seed    realized vol, 2d 1m candles
                                            │  :7891/        serves dist/ statically
                                            ▼
                                  browser game client
                                  └─ relay silent >2 s → embedded SimFeed (same wire)
```
**Relay** (`server/relay.mjs`, Node 24, zero-dep): one read-only WS client to
the desk (broadcast-all — the server is built for multiple consumers); filters
to the L1 subset; re-serves as **SSE** (`/stream`) so the browser needs no
WS handshake. Also serves `/seed` (realized vol from 2 days of 1m BTC
candles — `{coin,tf,bars:[{t,o,h,l,c,v}]}` shape verified from the desk
fixture) and `dist/` statically (LAN demo = one process). Every relay frame
carries `src: "live"`. If the relay is unreachable or silent for 2 s, the
**client falls back to its embedded deterministic SimFeed** (`src: "sim"`)
— the professor's demo never depends on the LAN.
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

## 11. Balance table (v0 — the tuning contract)
All in game units. Capital starts **$1,000,000**. Base burn vs funding:
- Funding Desk T0: 2 Clean Data/s → 40 Capital/s. One feed + 2 cleaners +
  1 funding desk ≈ break-even on a starter line. Vault cap 50k.
- Costs: Miner $50k, Cleaner $80k, Analytics $120k, Factory $250k, Funding
  $60k, Vault $40k, Link $2k, Trader $15k, Tape $10k, Dark Pool $30k,
  Arbitrage $25k, Printer $90k, Tower $110k, Research Desk $200k, Roadshow
  $2M.
- Bros: Analyst comp $20k, Trader $60k, MD $180k, Quant $500k. Quota 250.
  Evolution: 0→1 over ~45 min of active impact at moderate play; affects
  spawn mix + comp.
- Research: each tech costs craft-points (5–18 lab crafts, one desk ~1–3 min
  per tech); ~6–10 techs per playthrough.
- Roadshow: consumes 400 Alpha at 4/s (~100 s sustained delivery) once the
  hire quota is met; build cost $2M.
- Tuning method: Vitest simulation harness runs scripted "optimal" play →
  assert IPO reachable by ~40–50 min; defeat possible by neglect ~15 min.
- **Known tension (tuning pass pending)**: funding income caps at
  `capitalCapacity` (1M + 50K/vault) while the 250-hire quota costs ~$5M+ in
  comp — a full playthrough needs either more vaults, cheaper comps, or a
  higher funding ceiling. The demo mode sidesteps this with a seed-round
  top-up; the real-game economy needs a balance pass before hand-in.

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

## 12b. Shipped status (2026-08-25 →)
- **Done**: M1–M7 sim + UI (production chain, belts/traders, power/brownout,
  research, bros/impact/defense, hire, HQ, margin call, IPO roadshow,
  win/lose overlays + end-game report with capital sparkline), live market
  relay (L1 read-only) with client-side SimFeed fallback, autosave +
  resume, WebAudio synth SFX, `?demo` cinematic autoplay.
- **Gate**: `npm run check` = typecheck + 75 Vitest tests + Vite build.
- **Verified live**: Windows Chrome via headless driver (production flow,
  bro raids, tower defense, hiring, save/resume, demo IPO win).
- **Cross-platform**: any browser opens `http://<host>:7891` (relay serves
  `dist/`); zero install. MacBook on LAN (ping OK, SSH closed) — Safari/
  Chrome check pending on-site.

## 13. Non-goals (scope guard — v1)
No fluids/derivatives, no logistics bots, no circuit network, no blueprints,
no multiplayer, no mobile. Anything from this list only after M7 is green.

---

*Change procedure: design changes land here first, then code. Every system
touched must keep §4 mapping consistent.*
