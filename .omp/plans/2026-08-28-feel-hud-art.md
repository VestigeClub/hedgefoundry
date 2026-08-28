# Feel / world-art / HUD overhaul (2026-08-28)

Status: IMPLEMENTING — phase A (feel) in progress · last commit: 50aeda2 · next: engine/fx.ts

Brief (Zain, 2026-08-28): "nothing looks or feels different." Selected ALL:
game feel, HUD rebuild, world art, then punch-list mode. Impeccable route:
scoped-existing enhancement — the pinned world stays **quant terminal dark**
(DESIGN.md §8); we amplify it, never replace it.

## Direction

- **Everything reacts.** Every sim event a player can perceive gets a cue:
  particles for deaths/hits/places, floating $ on sales and hires, screen
  trauma on HQ damage and wave spawn, one synth voice each. Silence is a bug.
- **Machines tell the truth.** Working = pulsing core synced to craft progress;
  starved = amber glyph pulse; unpowered = desaturated. Readable in one glance
  from zoomed-out distance.
- **The HUD is a trading desk, not a log line.** Replaces the single
  `CAP · BURN · PWR · …` string with themed stat cards, heat/evolution meters,
  a hires progress bar, item chips, and a wave dial. Tabular numerals, real
  hover/disabled states, focus rings, themed selection + scrollbars.
- **World depth.** Shadows under entities, belt lanes with moving chevrons and
  item glow, feed tiles with a tape shimmer, ground speckle. No new palette —
  same cyan/green/pink on `#0a0e14`, more contrast and motion.

## Architecture

- `src/engine/fx.ts` — pooled particles / floating texts / trauma. Fixed
  caps, zero steady-state allocation, update+draw from `renderFrame`.
- Sim → render bridge: `World.fx: FxCue[]` (plain queue, drained every frame,
  never saved, capped). Sim pushes cues where events happen; renderer never
  polls sim internals.
- Sound: new voices in `ui/sound.ts` (existing WebAudio synth pattern),
  per-kind throttle so 20 bros dying can't stack 20 pops.

## Phases (each ends green + committed)

1. **Feel** — fx.ts, cue queue (damage/death/wave/hire/sale/demolish/place),
   sound voices, shake, float texts. Tests: pool lifecycle, trauma decay,
   cue emission, save-clears-queue. Proof: live run, deaths visible.
2. **World art** — entity-render.ts + renderer.ts: states, shadows, belts,
   feeds, ground, bro silhouettes. Proof: screenshots before/after, fps holds.
3. **HUD** — index.html/style.css/hud.ts/build.ts/panel.ts: cards, meters,
   chips, dial, affordability dimming, browser surfaces. Existing DOM tests
   (build/panel/report) must keep passing.
4. **Finish** — full `npm run check`, live screenshot pass, push question,
   punch-list mode (Zain fires gripes, each fixed same-session).

## Non-goals

No gameplay/balance changes, no new mechanics, no fonts fetched from network
(self-host or installed faces only), no art assets — code-drawn only.
