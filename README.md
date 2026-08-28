# HedgeFoundry

Factorio, but you run a hedge fund. A school assignment: mine market data,
process signals, assemble trading strategies, defend against finance bros,
and hit your hiring quota to IPO.

Play it now: **https://vestigeclub.github.io/hedgefoundry/** — current `main`,
built and deployed by GitHub Actions on every push. No install, no server.

Status: **M1–M6 shipped; M7 (the IPO win route) is still open.** TypeScript
strict + Vite + Vitest; gate `npm run check` green (**124 tests**, 17 files).
M7 is stated as open because it is measured that way: the scripted 50-sim-minute
arc samples `ipo=none` at every point, and an earlier "win verified live" claim
was withdrawn — see `docs/BUILD_LOG.md:89-91`. Full design in `docs/DESIGN.md`.

## Play

```sh
npm install
npm run check       # typecheck + tests + production build (the gate)
npm run dev         # dev server → http://localhost:5173
node server/relay.mjs   # live market relay → serves the built game on :7891
```

- **Live market data**: the relay streams real BTC/ETH/SOL marks + candles
  (read-only) from a market-data server you point it at with `DESK_WS` /
  `DESK_REST` (see `.env.example`); without it the game runs on a deterministic
  simulated feed (LIVE/SIM chip in the corner). Nothing in the game knows an
  internal hostname — the upstream is configuration, not code.
- **Zero install for the professor**: `npm run build && node server/relay.mjs`,
  then open `http://<this-machine-ip>:7891` in any browser.
- **Cinematic demo**: open `http://localhost:5173/?demo` (or the relay's
  `:7891/?demo`) — a scripted autoplayer builds the rig, fights off bros and
  hires toward the quota on its own.
- **Controls**: `1–0, Q, E, G` build · `R` rotate · `T` research · `X` remove ·
  `WASD`/arrows pan · wheel zoom · middle-drag pan. Click a bro → HIRE.
- Autosaves every 10s (resume on reload; NEW GAME clears).

## Rules

- Mine **RAW DATA** from data feeds → clean → signals → alpha → fund the
  IPO roadshow. Machines burn **capital**; funding desks + treasury vaults
  keep the grid alive (brownout when reserves run low).
- Machines leak **market impact** → attracts **finance bros** in growing
  waves. Hire them (comp + quota) or shred them with compliance towers
  (legal-brief ammo). Quota 250 + roadshow = **IPO** (win).
- Margin call (10s at zero capital) or a destroyed HQ = **liquidation**
  (loss). Every run is deterministic: same seed + actions = same result.

Runs on Windows, macOS, and in any browser (web-first target).
