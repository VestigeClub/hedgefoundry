/**
 * Boot: engine loop + camera + input + tile renderer + world sim + market
 * feed + build UI + sound. DESIGN.md M1–M7.
 */
import "./style.css";
import { Camera } from "./engine/camera";
import { Input } from "./engine/input";
import { Loop, speedChipLabel } from "./engine/loop";
import { drawMap, drawImpact } from "./engine/renderer";
import { drawEntities } from "./engine/entity-render";
import { Fx } from "./engine/fx";
import { FeedClient, fetchWorldSeed, relayBase } from "./market/feed";
import { generateMap } from "./world/mapgen";
import { HIRE_QUOTA, World, type FxCue } from "./sim/world";
import { tickWorld } from "./sim/update";
import { serializeWorld, deserializeWorld, saveToStorage, loadFromStorage, clearStorageSave } from "./sim/save";
import { Ticker } from "./ui/ticker";
import { Hud } from "./ui/hud";
import { Panel } from "./ui/panel";
import { BuildController } from "./ui/build";
import { ResearchPanel } from "./ui/research";
import { HelpOverlay } from "./ui/help";
import { Minimap } from "./ui/minimap";
import { Sound } from "./ui/sound";
import { renderReport } from "./ui/report";
import { Demo, demoSpeed } from "./demo/autoplay";
import { Tutorial, type TutorialProgress } from "./tutorial/tutorial";
import { TutorialCard } from "./tutorial/card";
import { TUTORIAL_STEPS, type TutorialRect } from "./tutorial/steps";
import { drawHighlight } from "./tutorial/highlight";
import { TILE_SIZE, type TileMap } from "./world/tilemap";
import type { FeedPatch } from "./world/mapgen";

// Dev/verification hook: lets browser automation drive and inspect the sim.
declare global {
  interface Window {
    __HF?: {
      world: World;
      camera: Camera;
      map: TileMap;
      error?: string;
      demo?: Demo;
      tick?: (dtMs: number) => void;
      frame?: () => void;
      fx?: Fx;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;

const WORLD_SEED = 1337;
const MAP_W = 256;
const MAP_H = 256;
const MAP_OPTS = { width: MAP_W, height: MAP_H, seed: WORLD_SEED, startClearRadius: 24, poolClusters: 40 };

const camera = new Camera(innerWidth, innerHeight);
const input = new Input(canvas);
const gen = generateMap(MAP_OPTS);
let world = new World({ map: gen.map, feeds: gen.feeds, seed: WORLD_SEED });
let feeds: FeedPatch[] = gen.feeds;

// M7: ?demo starts fresh, never resumes an autosave.
const isDemo = new URLSearchParams(location.search).has("demo");
if (isDemo) clearStorageSave();

// M6: resume an autosave if present; discard corrupt data.
const saved = loadFromStorage();
let savedTutorial: TutorialProgress | undefined;
if (saved) {
  try {
    const r = deserializeWorld(saved);
    world = r.world;
    feeds = r.feeds;
    savedTutorial = r.tutorial;
    console.log("[save] resumed autosave");
  } catch (err) {
    console.warn("[save] discarding corrupt save", err);
    clearStorageSave();
  }
}

// M5: the Fund Office anchors the map — bros gravitate to it and its death
// is a loss condition.
if (!world.entities.has(world.hqId)) world.spawnHQ();

// Boot camera: center on the feed patch nearest the map center (spawn area),
// so the player sees where to start building.
{
  const cx = MAP_W / 2;
  const cy = MAP_H / 2;
  let best = feeds[0]!;
  let bestD = Infinity;
  for (const f of feeds) {
    const fx = f.x + f.w / 2;
    const fy = f.y + f.h / 2;
    const d = Math.abs(fx - cx) + Math.abs(fy - cy);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  camera.x = (best.x + best.w / 2) * 32 - innerWidth / 2;
  camera.y = (best.y + best.h / 2) * 32 - innerHeight / 2;
}

const ticker = new Ticker(
  document.querySelector<HTMLElement>("#ticker")!,
  document.querySelector<HTMLElement>("#feed-chip")!,
);

const feed = new FeedClient(relayBase(), WORLD_SEED, {
  onFrame: (f) => ticker.onFrame(f),
  onStatus: (s) => ticker.setStatus(s),
});

const hud = new Hud(document.querySelector<HTMLElement>("#hud")!);
const panel = new Panel(document.querySelector<HTMLElement>("#panel")!, world);
const toastEl = document.querySelector<HTMLElement>("#toast")!;
let toastTimer: number | null = null;

/** Transient banner: build errors, hires, market stress, sim errors. */
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer ?? undefined);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1600);
}

const errorChip = document.querySelector<HTMLElement>("#error-chip")!;
let fatalDone = false;

/**
 * A throw out of the sim or the renderer used to land in a dev-only global,
 * which in a served build meant a frozen canvas and no explanation. Stop the
 * clock — a broken world must not keep autosaving — name the failure on
 * screen, and keep the console stack for whoever has to fix it.
 */
function fatal(where: string, err: unknown): void {
  const msg = err instanceof Error ? `${err.message}` : String(err);
  console.error(`[${where}]`, err);
  if (fatalDone) return;
  fatalDone = true;
  loop.stop();
  errorChip.textContent = `SIM HALTED — ${where.toUpperCase()}: ${msg}`;
  errorChip.classList.add("show");
  const hf = window.__HF;
  if (hf) hf.error = `${where}: ${msg}`;
}

const sound = new Sound();
addEventListener("pointerdown", () => sound.unlock());
addEventListener("keydown", () => sound.unlock());

/** Screen effects: fed by World.fx cues drained once per rendered frame. */
const fx = new Fx();
const CUE_COLORS: Record<FxCue["kind"], string> = {
  place: "#00e68c",
  demolish: "#8b93a5",
  hit: "#fb7185",
  hqhit: "#fb7185",
  death: "#ff2d55",
  spawn: "#ff9e2c",
  wave: "#ff9e2c",
  hire: "#00e68c",
  sale: "#00e68c",
  void: "#ff2d55",
  alarm: "#ff9e2c",
};

/**
 * Turn sim cues into particles, floats, shake and sound. Cues carry tile
 * coordinates; effects live in world pixels (tile center = (x+0.5)*32).
 */
function drainCues(): void {
  for (const c of world.fx) {
    const wx = (c.x + 0.5) * 32;
    const wy = (c.y + 0.5) * 32;
    const col = CUE_COLORS[c.kind];
    switch (c.kind) {
      case "place":
        fx.burst(wx, wy, col, 7, 60, 420, 2.5);
        if (isDemo) sound.place();
        break;
      case "demolish":
        fx.burst(wx, wy, col, 10, 90, 520);
        sound.demolish();
        break;
      case "hit":
        fx.burst(wx, wy, col, 4, 70, 260, 2);
        sound.hit();
        break;
      case "hqhit":
        fx.burst(wx, wy, col, 9, 110, 420, 3);
        fx.addTrauma(0.35);
        sound.hit();
        break;
      case "death":
        fx.burst(wx, wy, col, 16, 150, 620, 3);
        fx.addTrauma(0.12);
        sound.death();
        break;
      case "spawn":
        fx.ring(wx, wy, col, 26, 520, 2);
        sound.broSpawn();
        break;
      case "wave":
        fx.ring(wx, wy, col, 90, 900, 3);
        fx.addTrauma(0.25);
        sound.wave();
        break;
      case "hire":
        fx.floatText(`HIRE -$${Math.round(c.v ?? 0)}`, col, wx, wy);
        fx.ring(wx, wy, col, 34, 600, 2);
        sound.hire();
        break;
      case "sale":
        fx.floatText(`+$${Math.round(c.v ?? 0)}`, col, wx, wy, 750);
        sound.sale();
        break;
      case "void":
        fx.burst(wx, wy, col, 6, 55, 700, 2);
        break;
      case "alarm":
        fx.addTrauma(0.6);
        sound.alarm();
        break;
    }
  }
  world.fx.length = 0;
}

const build = new BuildController(
  world,
  camera,
  input,
  {
    onSelect: (e) => panel.setSelection(e),
    onPlace: () => sound.place(),
    onDeny: () => sound.denied(),
    toast,
  },
  document.querySelector<HTMLElement>("#buildbar")!,
);
const research = new ResearchPanel(document.querySelector<HTMLElement>("#research")!, world);
const help = new HelpOverlay(document.querySelector<HTMLElement>("#help")!);
const minimap = new Minimap(document.querySelector<HTMLElement>("#minimap")!, world, camera);

// Onboarding tutorial (DESIGN.md §8a): fresh world only, never ?demo. An
// old save with no tutorial field means an established player — done.
const freshWorld = [...world.entities.values()].every((e) => e.kind === "hq");
const tutorial = isDemo ? null : new Tutorial(savedTutorial ?? { step: 0, done: !freshWorld });
const tutorialCard = tutorial
  ? new TutorialCard(document.querySelector<HTMLElement>("#tutorial")!, () => tutorial.skip())
  : null;
// Any pan past the boot position completes step 0 (0.5 tiles, Manhattan).
const tutorialHome = tutorial ? { x: camera.x, y: camera.y } : null;
let tutorialPainted = -1;

// M7: cinematic demo mode (?demo) — scripted autoplay at 4× sim speed.
const demo = isDemo ? new Demo(world, camera) : null;

// M6: audio events via per-frame deltas (sim stays pure).
let lastTotals = { ...world.totals };
let lastTowerAmmo = 0;
let lastWarningAt = -Infinity;
let lastCraftSoundAt = 0;
let lastState: "playing" | "won" | "lost" = world.state;



// World seed from the relay (realized vol) — consumed by world-gen later.
fetchWorldSeed(relayBase()).then((ws) => {
  console.log(`[market] world seed: src=${ws.src} vol=${ws.vol} last=${ws.last}`);
});

let lastMouse = { x: 0, y: 0 };
const PAN_SPEED = 700; // CSS px/s at zoom 1
let lastSaveMs = 0;
let lastVoided = 0;
let lastWasteAt = -Infinity;
let lastFrameMs = performance.now();
let prevT = false;
let prevX = false;
let prevSpace = false;
let prevMinus = false;
let prevEqual = false;
let prevHelp = false;

function sizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.setView(innerWidth, innerHeight);
}

const loop = new Loop({
  tick: (dtMs) => {
    try {
      feed.advanceSim(dtMs); // no-op while the relay is live
      tickWorld(world, dtMs * (demo ? demoSpeed() : 1));
      // Autosave every 10 s of sim time (P&L sampling lives in tickWorld).
      // Time freezes at game over, so this must be state-guarded or it
      // serializes a finished world every frame. Demo never writes: the
      // scripted run would overwrite the player's campaign save (audit C1).
      if (world.state === "playing" && !isDemo && world.timeMs - lastSaveMs >= 10_000) {
        saveToStorage(serializeWorld(world, MAP_OPTS, tutorial?.progress()));
        lastSaveMs = world.timeMs;
      }
      // Ctrl+S saves now — the player's instinct, and the browser dialog it
      // used to open is a gameplay interruption (audit C4).
      if (input.consumeSaveRequest()) {
        if (world.state === "playing" && !isDemo) {
          saveToStorage(serializeWorld(world, MAP_OPTS, tutorial?.progress()));
          lastSaveMs = world.timeMs;
          toast("SAVED");
        } else {
          toast(isDemo ? "DEMO — NOTHING TO SAVE" : "RUN OVER — NOTHING TO SAVE");
        }
      }
    } catch (err) {
      fatal("tick", err);
    }
  },
  render: (dt) => {
    try {
      renderFrame(dt);
    } catch (err) {
      fatal("render", err);
    }
  },
});

function renderFrame(_alpha: number): void {
  // Wall-clock delta: the Loop passes an interpolation alpha to render, but
  // pan speed and demo pacing need real ms.
  const nowMs = performance.now();
  const frameMs = Math.min(nowMs - lastFrameMs, 250);
  lastFrameMs = nowMs;

  // Keyboard pan (WASD + arrows).
  const dxk =
    (input.keys.has("KeyD") || input.keys.has("ArrowRight") ? 1 : 0) -
    (input.keys.has("KeyA") || input.keys.has("ArrowLeft") ? 1 : 0);
  const dyk =
    (input.keys.has("KeyS") || input.keys.has("ArrowDown") ? 1 : 0) -
    (input.keys.has("KeyW") || input.keys.has("ArrowUp") ? 1 : 0);
  if (dxk !== 0 || dyk !== 0) {
    // panByScreen is drag semantics (camera moves OPPOSITE the delta) — using
    // it for keys inverted WASD/arrows: D panned left, W panned down.
    camera.panByWorld(dxk * PAN_SPEED * (frameMs / 1000), dyk * PAN_SPEED * (frameMs / 1000));
  }

  // Middle-drag pan.
  if (input.mouse.middle) {
    camera.panByScreen(input.mouse.x - lastMouse.x, input.mouse.y - lastMouse.y);
  }
  lastMouse = { ...input.mouse };

  // Wheel zoom at cursor.
  const wheel = input.consumeWheel();
  if (wheel !== 0) {
    camera.zoomAt(input.mouse.x, input.mouse.y, wheel > 0 ? 1 / 1.15 : 1.15);
  }

  build.update();
  // Edge-trigger the research toggle: held KeyT must not flip the panel
  // ~60×/s (same rising-edge pattern as the build menu keys).
  const tDown = input.keys.has("KeyT");
  if (tDown && !prevT) research.toggle();
  prevT = tDown;
  research.update();
  // Pause + speed (audit B1): the Loop has supported this since M1, nothing
  // was wired. Edge-triggered like T so a held key flips exactly once.
  const spaceDown = input.keys.has("Space");
  if (spaceDown && !prevSpace) loop.paused = !loop.paused;
  prevSpace = spaceDown;
  const minusDown = input.keys.has("Minus");
  if (minusDown && !prevMinus) loop.speed = loop.speed === 2 ? 1 : loop.speed === 4 ? 2 : 4;
  prevMinus = minusDown;
  const equalDown = input.keys.has("Equal");
  if (equalDown && !prevEqual) loop.speed = loop.speed === 2 ? 4 : loop.speed === 1 ? 2 : 1;
  prevEqual = equalDown;
  const hDown = input.keys.has("KeyH");
  if (hDown && !prevHelp) help.toggle();
  prevHelp = hDown;

  if (demo) {
    demo.update(frameMs);
    demo.frame();
  }
  // The map is finite; panning past its edge showed only void (clampTo has
  // been unit-tested since M1 and was never wired up — audit D1).
  camera.clampTo(MAP_W * TILE_SIZE, MAP_H * TILE_SIZE);

  // Tutorial: check triggers at its own throttle, patch the card, resolve the
  // ring target for this frame (DESIGN.md §8a).
  let tutorialTarget: TutorialRect | null = null;
  if (tutorial && tutorialCard && world.state === "playing") {
    const moved = tutorialHome
      ? Math.abs(camera.x - tutorialHome.x) + Math.abs(camera.y - tutorialHome.y) > 16
      : false;
    const snap = tutorial.update(world, frameMs, { cameraMoved: moved });
    const step = TUTORIAL_STEPS[snap.step];
    if (snap.done) {
      tutorialCard.hide();
    } else if (step && tutorialPainted !== snap.step) {
      tutorialPainted = snap.step;
      tutorialCard.setStep(step);
    }
    tutorialCard.setTrouble(snap.done ? null : snap.trouble);
    if (!snap.done && step) tutorialTarget = step.highlight(world);
  }

  drainCues();
  fx.update(frameMs);
  ctx.save();
  ctx.translate(fx.shakeX, fx.shakeY);
  drawMap(ctx, world.map, camera, world.timeMs);
  drawImpact(ctx, world, camera);
  drawEntities(ctx, world, camera, world.timeMs);
  if (tutorialTarget) drawHighlight(ctx, camera, tutorialTarget, world.timeMs);
  ctx.restore();
  build.drawGhost(ctx);
  fx.draw(ctx, camera);

  hud.update(world);
  minimap.update(nowMs);
  panel.update();
  // A selected entity killed by a bro used to leave the inspector open on a
  // ghost forever (audit C3).
  {
    const sel = panel.current();
    if (sel && !world.entities.has(sel.id)) panel.setSelection(null);
  }
  // Speed chip: pause + multiplier chrome (audit B1), patched on change like
  // every other chip; amber while paused.
  {
    const el = document.querySelector<HTMLElement>("#speed-chip")!;
    const label = speedChipLabel(loop.paused, loop.speed);
    if (el.textContent !== label) {
      el.textContent = label;
      el.className = `chip${loop.paused ? " warn" : ""}`;
    }
  }
  // Status chip: persistent ambient alerts + the transient waste override.
  {
    const el = document.querySelector<HTMLElement>("#status-chip")!;
    const voided = Object.values(world.writtenOff).reduce((a, b) => a + b, 0);
    if (voided !== lastVoided) {
      lastVoided = voided;
      lastWasteAt = nowMs;
    }
    let msg = "";
    let cls = "";
    if (nowMs - lastWasteAt < 3_000) {
      // Wasted output names the concrete mistake — it overrides the ambient
      // state for 3 s after it fires (audit B4).
      msg = "OUTPUT WASTED";
      cls = "warn";
    } else if (world.broSpawnTimerMs < 10_000) {
      msg = "WAVE INBOUND";
      cls = "warn";
    } else if (world.marginCallMs > 0) {
      msg = "MARGIN CALL";
      cls = "warn";
    } else if (world.hired >= HIRE_QUOTA) {
      msg = "IPO READY";
      cls = "good";
    }
    if (msg !== el.textContent) {
      el.textContent = msg;
      el.className = `chip ${cls}`;
    }
  }

  // M6: audio events via deltas.
  {
    const now = world.timeMs;
    for (const it of ["clean", "signal", "alpha", "brief"] as const) {
      if (world.totals[it] > lastTotals[it] && now - lastCraftSoundAt > 120) {
        sound.craft(it);
        lastCraftSoundAt = now;
        break;
      }
    }
    lastTotals = { ...world.totals };
    let towerAmmo = 0;
    for (const e of world.entities.values()) if (e.kind === "tower") towerAmmo += e.input?.items.brief ?? 0;
    if (towerAmmo < lastTowerAmmo) sound.towerShot();
    lastTowerAmmo = towerAmmo;
    if (world.capital < world.demandPerSec * 10 && now - lastWarningAt > 10_000) {
      sound.warning();
      lastWarningAt = now;
    }
  }

  // X demolishes the selection and refunds half (§5.4). Edge-triggered like
  // every other key: held down, this deleted the whole plant one machine per
  // frame. The Fund Office is permanent — losing it is the loss condition, so
  // the refusal says so instead of eating the keypress in silence.
  const xDown = input.keys.has("KeyX");
  if (xDown && !prevX && panel.hasSelection()) {
    const e = panel.current();
    if (e && !world.removeEntity(e.id)) toast("FUND OFFICE — NOT DEMOLISHABLE");
    panel.setSelection(null);
  }
  prevX = xDown;

  // Game over overlay + end-game report.
  if (world.state !== "playing") {
    // The card must not bleed through the game-over overlay or re-show
    // beneath it (audit B2). The tutorial block above skips finished runs;
    // this hides the card the frame the run ends.
    tutorialCard?.hide();
    const overlay = document.querySelector<HTMLElement>("#overlay")!;
    overlay.classList.add("show");
    const title = document.querySelector<HTMLElement>("#overlay-title")!;
    const sub = document.querySelector<HTMLElement>("#overlay-sub")!;
    const stats = document.querySelector<HTMLElement>("#overlay-stats")!;
    // Three endings, one per way a run stops (§5.9). A fund that loses its
    // office was stormed, not liquidated; the advice differs, so the headline
    // must too.
    if (world.state === "won") {
      title.textContent = "IPO COMPLETE — YOU'RE THE FUND";
      sub.textContent = `Hired ${world.hired}/${HIRE_QUOTA} · Alpha ${world.totals.alpha} · Run ${Math.floor(world.timeMs / 60_000)}m`;
    } else if (world.lossReason === "hq") {
      title.textContent = "OFFICE OVERRUN — THE BROS WON";
      sub.textContent =
        `Hired ${world.hired}/${HIRE_QUOTA} · Briefs printed ${world.totals.brief} · Run ${Math.floor(world.timeMs / 60_000)}m · ` +
        "The Fund Office fell. Print briefs and garrison it before you scale the plant.";
    } else {
      title.textContent = "MARGIN CALL — FUND LIQUIDATED";
      sub.textContent =
        `Hired ${world.hired}/${HIRE_QUOTA} · Burn ${world.demandPerSec.toFixed(0)} $/s · Run ${Math.floor(world.timeMs / 60_000)}m · ` +
        "Power bills outran sales. Sell a richer fuel, or unpowered idle iron.";
    }
    if (world.state !== lastState) {
      renderReport(stats, world);
      if (world.state === "won") sound.win();
      else sound.lose();
      lastState = world.state;
    }
    title.classList.toggle("lost", world.state === "lost");
  }
}

addEventListener("resize", sizeCanvas);
sizeCanvas();
loop.start();
document.querySelector<HTMLElement>("#overlay-btn")!.addEventListener("click", () => {
  clearStorageSave();
  // Leave the URL params behind: reloading `?demo` straight into NEW GAME
  // restarts the demo forever and the player cannot reach a real run
  // (audit C2).
  location.href = location.pathname;
});
addEventListener("beforeunload", () => {
  if (world.state === "playing" && !isDemo) saveToStorage(serializeWorld(world, MAP_OPTS, tutorial?.progress()));
});
// The playtest harness (docs/OPERATIONS.md) drives the game through this
// handle, so it exists in a dev build or when the page is opened with ?debug.
// It is a live reference to the running world — handing one to every visitor of
// the graded site is neither private nor harmless.
if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) {
  window.__HF = {
    world,
    camera,
    map: world.map,
    demo: demo ?? undefined,
    tick: (dtMs) => tickWorld(world, dtMs),
    frame: () => renderFrame(0),
    fx,
  };
}
