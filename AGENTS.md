# AGENTS.md — repo rules for agentic development

## Project
Factorio-like real-time factory game, reskinned as a hedge fund: mine market
data, process signals, assemble strategies, research alpha, survive the
finance bros, hit the hiring quota, IPO = victory. School assignment — must
run on Windows, macOS, and in a browser for the professor.

**DECIDED (2026-08-25)**: custom TypeScript engine (Canvas2D, no runtime deps),
Vite build, Vitest for logic tests. Web-first; runs on Windows/macOS/browser.
Art: quant terminal dark. See `docs/DESIGN.md` — it is the contract for every
system; theme mapping §4 is law.

## Commands
- `npm run dev` — dev server (localhost:5173)
- `npm run check` — full gate: typecheck + tests + production build. MUST pass
  before any merge-worthy state.
- `npm test` / `npm run typecheck` / `npm run build` — individual steps.
- `node server/relay.mjs` — market data relay (live upstream feed + sim
  fallback), wire spec in `docs/DESIGN.md` §6.

## Repo layout
- `src/` — game source (engine + systems)
- `docs/` — DESIGN.md (game design doc), OPERATIONS.md (repo mechanics)
- `.omp/plans/` — one markdown plan per work phase
- `scripts/` — dev/build tooling

## Agent workflow
1. Read `docs/DESIGN.md` before touching game systems. Design first: a
   feature with no design entry is not ready to build.
2. Plans go in `.omp/plans/`; keep them current as work evolves.
3. TDD for pure logic (economy, belts, combat, save/load); visual
   verification for rendering/UX (launch the game, observe, screenshot).
4. Every commit leaves the game runnable. No broken intermediate states.
5. Verify before claiming done: build + targeted tests, or a live run of
   the changed path.

## Conventions
- TypeScript strict mode. No `any`; no `@ts-ignore` without a comment.
- Modules grouped by system; files under ~400 lines; hot paths
  (tick/render) avoid allocation — profile before optimizing.
- No second convention beside an existing one: reuse patterns in-repo.
- UI copy is finance-native and terse; teach like a bright junior.
- No dead code, no placeholder branches, no silent fallbacks.

## Verification gate
Before any merge-worthy state: typecheck + tests + build must pass
(`npm run check` once the stack is up). Visual claims require a screenshot
or live-run proof.
