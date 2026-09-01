# HedgeFoundry

Factorio, but you run a hedge fund. A school assignment: mine market data,
process signals, assemble trading strategies, defend against finance bros,
and hit your hiring quota to IPO.

Play it now: **https://vestigeclub.github.io/hedgefoundry/** — current `main`,
built and deployed by GitHub Actions on every push. No install, no server.

Status: **shipped.** TypeScript strict + Vite + Vitest; the gate
`npm run check` runs on every push (GitHub Actions) and is green — **176
tests, 26 files**. The scripted 50-sim-minute arc in
`src/sim/reachability.test.ts` — build, defend, expand, hire, no injected
capital — reports `state=won` at 19.9 minutes, and the browser build rides
to the **IPO COMPLETE** overlay (`?demo`). One unfamiliar-user pass is
logged with its four frictions and fixes. What still owes evidence is
honest and stated in `BUILD_LOG.md` / `docs/PLAYTEST.md`: no *human hand*
has yet completed the 11-step tutorial unaided, and nothing has been
measured in Safari. Full design in `docs/DESIGN.md`; the whole build —
every phase, prompt, and check — is in **`BUILD_LOG.md`** (repo root).

## Play

```sh
npm install
npm run check       # typecheck + tests + production build (the gate)
npm run dev         # dev server → http://localhost:5173
node server/relay.mjs   # live market relay → serves the built game on :7891
```

- **Live market data**: the relay streams real crypto marks + candles
  (read-only) from a market-data server you point it at with `DESK_WS` /
  `DESK_REST` (see `.env.example`); in-game they are presented as the
  fund's own instruments — **FLUX / ORBIT / ZENITH**. Without a relay the
  game runs on a deterministic simulated feed (LIVE/SIM chip in the
  corner). Nothing in the game knows an internal hostname — the upstream
  is configuration, not code.
- **Zero install for the professor**: `npm run build && node server/relay.mjs`,
  then open `http://<this-machine-ip>:7891` in any browser.
- **Cinematic demo**: open the game URL with `?demo` — a scripted
  autoplayer builds the rig, fights off bros and hires to the quota on its
  own, reaching IPO in ~9.6 minutes of real time. `?class` runs the same
  arc against a 2× threat clock (a full win inside ~40 class-minutes).
- **Controls**: `1–0, Q, E, G` build · `R` rotate · `T` research · `X`
  remove (select first) · `B` blueprint copy/paste · `Space` pause ·
  `-` / `=` speed 1×/2×/4× · `H` help · `I` stats · `WASD`/arrows pan ·
  wheel zoom · middle-drag pan. Click a bro → HIRE.
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
