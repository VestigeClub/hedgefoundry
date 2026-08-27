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

## Hard rules (each one is a measured failure)
1. **Read, then patch, in the same turn.** Never reproduce file text from memory and
   never invent a snapshot tag. Multi-function change, or a file you have not fully
   read → rewrite the whole file.
2. **Scoped check after every file change** (`npm run typecheck` +
   `npx vitest run <file>`), full `npm run check` at boundaries — **unfiltered**.
   Never pipe the gate through `grep`/`head`, never redirect output to a repo file.
3. **Commit at every green check.** Never leave the tree dirty at session end. The
   plan file carries `Status:` with the last commit hash and the next action.
4. **The `bash` tool is POSIX bash**: bash syntax, forward slashes; PowerShell only
   single-quoted. Any command handed to Zain is first verified against the installed
   binary, with its shell named.

Full mechanics — verification ladder, subagent file ownership, context budget, visual
verification, harness limits, boundaries: **`docs/OPERATIONS.md`**. It is binding.

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
