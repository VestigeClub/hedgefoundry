/**
 * Boot: engine loop + camera + input + tile renderer + world sim + market
 * feed + build UI + sound. DESIGN.md M1–M7.
 */
import "./style.css";
import { Camera } from "./engine/camera";
import { Input } from "./engine/input";
import { Loop } from "./engine/loop";
import { drawMap, drawImpact } from "./engine/renderer";
import { drawEntities } from "./engine/entity-render";
import { FeedClient, fetchWorldSeed, relayBase } from "./market/feed";
import { generateMap } from "./world/mapgen";
import { HIRE_QUOTA, World } from "./sim/world";
import { tickWorld } from "./sim/update";
import { serializeWorld, deserializeWorld, saveToStorage, loadFromStorage, clearStorageSave } from "./sim/save";
import { Ticker } from "./ui/ticker";
import { Hud } from "./ui/hud";
import { Panel } from "./ui/panel";
import { BuildController } from "./ui/build";
import { ResearchPanel } from "./ui/research";
import { Sound } from "./ui/sound";
import { renderReport, type HistoryPoint } from "./ui/report";
import { Demo, demoSpeed } from "./demo/autoplay";
import type { TileMap } from "./world/tilemap";
import type { FeedPatch } from "./world/mapgen";

// Dev/verification hook: lets browser automation drive and inspect the sim.
declare global {
  interface Window {
    __HF?: { world: World; camera: Camera; map: TileMap; error?: string; demo?: Demo; tick?: (dtMs: number) => void };
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

// M7: ?demo starts fresh, never resumes an autosave.
const isDemo = new URLSearchParams(location.search).has("demo");
if (isDemo) clearStorageSave();

let world = new World({ map: gen.map, feeds: gen.feeds, seed: WORLD_SEED });
let feeds: FeedPatch[] = gen.feeds;

// M6: resume an autosave if present; discard corrupt data.
const saved = loadFromStorage();
if (saved) {
  try {
    const r = deserializeWorld(saved);
    world = r.world;
    feeds = r.feeds;
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

const build = new BuildController(
  world,
  camera,
  input,
  {
    onSelect: (e) => panel.setSelection(e),
    toast: (msg) => {
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      clearTimeout(toastTimer ?? undefined);
      toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1600);
    },
  },
  document.querySelector<HTMLElement>("#buildbar")!,
);
const research = new ResearchPanel(document.querySelector<HTMLElement>("#research")!, world);
const sound = new Sound();
addEventListener("pointerdown", () => sound.unlock());
addEventListener("keydown", () => sound.unlock());

// M7: cinematic demo mode (?demo) — scripted autoplay at 4× sim speed.
const demo = isDemo ? new Demo(world, camera) : null;

// M6: audio events via per-frame deltas (sim stays pure).
let lastTotals = { ...world.totals };
let lastBroCount = 0;
let lastHired = 0;
let lastTowerAmmo = 0;
let lastWarningAt = -Infinity;
let lastCraftSoundAt = 0;
let lastState: "playing" | "won" | "lost" = world.state;

// M7: capital-arc history for the end-game report (10s samples).
const capHistory: HistoryPoint[] = [];
let brosKilled = 0;

// World seed from the relay (realized vol) — consumed by world-gen later.
fetchWorldSeed(relayBase()).then((ws) => {
  console.log(`[market] world seed: src=${ws.src} vol=${ws.vol} last=${ws.last}`);
});

let lastMouse = { x: 0, y: 0 };
const PAN_SPEED = 700; // CSS px/s at zoom 1
let lastSaveMs = 0;
let lastFrameMs = performance.now();

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
      // M6: autosave every 10s of sim time.
      if (world.timeMs - lastSaveMs >= 10_000) {
        saveToStorage(serializeWorld(world, MAP_OPTS));
        lastSaveMs = world.timeMs;
        capHistory.push({ t: world.timeMs, capital: world.capital, alpha: world.totals.alpha });
      }
    } catch (err) {
      const hf = window.__HF;
      if (hf) hf.error = String(err);
    }
  },
  render: (dt) => {
    try {
      renderFrame(dt);
    } catch (err) {
      const hf = window.__HF;
      if (hf) hf.error = String(err);
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
    camera.panByScreen(dxk * PAN_SPEED * (frameMs / 1000), dyk * PAN_SPEED * (frameMs / 1000));
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
  if (input.keys.has("KeyT")) research.toggle();
  research.update();

  if (demo) {
    demo.update(frameMs);
    demo.frame();
  }

  drawMap(ctx, world.map, camera);
  drawImpact(ctx, world, camera);
  drawEntities(ctx, world, camera, world.timeMs);
  build.drawGhost(ctx);

  hud.update(world);
  panel.update();

  // Status chip: wave inbound / IPO ready / capital deficit.
  {
    const el = document.querySelector<HTMLElement>("#status-chip")!;
    let msg = "";
    let cls = "";
    if (world.capital < world.demandPerSec * 10) {
      msg = "CAPITAL DEFICIT";
      cls = "warn";
    } else if (world.hired >= HIRE_QUOTA) {
      msg = "IPO READY";
      cls = "good";
    } else if (world.broSpawnTimerMs < 5_000) {
      msg = "WAVE INBOUND";
      cls = "warn";
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
    const bros = [...world.entities.values()].filter((e) => e.kind === "bro").length;
    if (bros > lastBroCount) sound.broSpawn();
    if (bros < lastBroCount) brosKilled += lastBroCount - bros;
    lastBroCount = bros;
    if (world.hired > lastHired) sound.hire();
    lastHired = world.hired;
    let towerAmmo = 0;
    for (const e of world.entities.values()) if (e.kind === "tower") towerAmmo += e.input?.items.brief ?? 0;
    if (towerAmmo < lastTowerAmmo) sound.towerShot();
    lastTowerAmmo = towerAmmo;
    if (world.capital < world.demandPerSec * 10 && now - lastWarningAt > 10_000) {
      sound.warning();
      lastWarningAt = now;
    }
  }

  // X removes the selected entity.
  if (input.keys.has("KeyX") && panel.hasSelection()) {
    const e = panel.current();
    if (e) world.removeEntity(e.id);
    panel.setSelection(null);
  }

  // Game over overlay + end-game report.
  if (world.state !== "playing") {
    const overlay = document.querySelector<HTMLElement>("#overlay")!;
    overlay.classList.add("show");
    const title = document.querySelector<HTMLElement>("#overlay-title")!;
    const sub = document.querySelector<HTMLElement>("#overlay-sub")!;
    const stats = document.querySelector<HTMLElement>("#overlay-stats")!;
    if (world.state === "won") {
      title.textContent = "IPO COMPLETE — YOU'RE THE FUND";
      sub.textContent = `Hired ${world.hired}/${HIRE_QUOTA} · Alpha ${world.totals.alpha} · Run ${Math.floor(world.timeMs / 60_000)}m`;
    } else {
      title.textContent = "MARGIN CALL — FUND LIQUIDATED";
      sub.textContent = "The bros won. Print briefs, defend the HQ, hire faster.";
    }
    if (world.state !== lastState) {
      stats.innerHTML = renderReport(world, { points: capHistory, brosKilled });
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
  location.reload();
});
addEventListener("beforeunload", () => {
  if (world.state === "playing") saveToStorage(serializeWorld(world, MAP_OPTS));
});
window.__HF = { world, camera, map: world.map, demo: demo ?? undefined, tick: (dtMs) => tickWorld(world, dtMs) };
