# Finance Game (working title — HedgeFoundry)

Factorio, but you run a hedge fund. A school assignment: build a
factory-automation game where you mine market data, process signals,
assemble trading strategies, defend against finance bros, and hit your
hiring quota to IPO.

Status: **M1 — engine foundation.** Stack live: TypeScript strict + Vite +
Vitest, gate `npm run check` green. Full design in `docs/DESIGN.md`.

## Run
```sh
npm install
npm run dev        # dev server → http://localhost:5173
npm run check      # typecheck + tests + production build
node server/relay.mjs   # (later) live market data relay
```

Runs on Windows, macOS, and in any browser (web-first target).
