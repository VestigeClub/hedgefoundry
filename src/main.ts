/**
 * Boot: engine loop + camera + input + tile renderer + world sim + market
 * feed + build UI. DESIGN.md M1–M3.
 */
import "./style.css";
import { Camera } from "./engine/camera";
import { Input } from "./engine/input";
import { Loop } from "./engine/loop";
 import { drawMap, drawImpact, PALETTE } from "./engine/renderer";
import { drawEntities } from "./engine/entity-render";
import { FeedClient, fetchWorldSeed, relayBase } from "./market/feed";
import { generateMap } from "./world/mapgen";
import { HIRE_QUOTA, World } from "./sim/world";
import { tickWorld } from "./sim/update";
import { Ticker } from "./ui/ticker";
import { Hud } from "./ui/hud";
import { Panel } from "./ui/panel";
import { BuildController } from "./ui/build";
import { ResearchPanel } from "./ui/research";
import type { TileMap } from "./world/tilemap";

// Dev/verification hook: lets browser automation drive and inspect the sim.
declare global {
  interface Window {
    __HF?: { world: World; camera: Camera; map: TileMap; error?: string };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;

const WORLD_SEED = 1337;
const MAP_W = 256;
const MAP_H = 256;

const camera = new Camera(innerWidth, innerHeight);
const input = new Input(canvas);
const { map, feeds } = generateMap({
  width: MAP_W,
  height: MAP_H,
  seed: WORLD_SEED,
  startClearRadius: 24,
  poolClusters: 40,
});
const world = new World({ map, feeds, seed: WORLD_SEED });
// M5: the Fund Office anchors the map — bros gravitate to it and its death
// is a loss condition.
world.spawnHQ();

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
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 1600);
    },
  },
  document.querySelector<HTMLElement>("#buildbar")!,
);
const research = new ResearchPanel(document.querySelector<HTMLElement>("#research")!, world);

// World seed from the relay (realized vol) — consumed by world-gen later.
fetchWorldSeed(relayBase()).then((ws) => {
  console.log(`[market] world seed: src=${ws.src} vol=${ws.vol} last=${ws.last}`);
});

let lastMouse = { x: 0, y: 0 };
const PAN_SPEED = 700; // CSS px/s at zoom 1

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
      tickWorld(world, dtMs);
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

function renderFrame(dt: number): void {
  // Keyboard pan (WASD + arrows).
  const dxk =
    (input.keys.has("KeyD") || input.keys.has("ArrowRight") ? 1 : 0) -
    (input.keys.has("KeyA") || input.keys.has("ArrowLeft") ? 1 : 0);
  const dyk =
    (input.keys.has("KeyS") || input.keys.has("ArrowDown") ? 1 : 0) -
    (input.keys.has("KeyW") || input.keys.has("ArrowUp") ? 1 : 0);
  if (dxk !== 0 || dyk !== 0) {
    camera.panByScreen(dxk * PAN_SPEED * dt, dyk * PAN_SPEED * dt);
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

   drawMap(ctx, map, camera);
  drawImpact(ctx, world, camera);
  drawEntities(ctx, world, camera, world.timeMs);
  build.drawGhost(ctx);

  hud.update(world);
    panel.update();

  // X removes the selected entity.
  if (input.keys.has("KeyX") && panel.hasSelection()) {
    const e = panel.current();
    if (e) world.removeEntity(e.id);
        panel.setSelection(null);
    }

  // Game over overlay.
  if (world.state !== "playing") {
    const overlay = document.querySelector<HTMLElement>("#overlay")!;
    overlay.classList.add("show");
    const title = document.querySelector<HTMLElement>("#overlay-title")!;
    const sub = document.querySelector<HTMLElement>("#overlay-sub")!;
    if (world.state === "won") {
      title.textContent = "IPO COMPLETE — YOU'RE THE FUND";
      sub.textContent = `Hired ${world.hired}/${HIRE_QUOTA} · Alpha ${world.totals.alpha} · Run ${Math.floor(world.timeMs / 60_000)}m`;
    } else {
      title.textContent = "MARGIN CALL — FUND LIQUIDATED";
      sub.textContent = "The bros won. Print briefs, defend the HQ, hire faster.";
    }
    title.classList.toggle("lost", world.state === "lost");
  }
}

addEventListener("resize", sizeCanvas);
sizeCanvas();
loop.start();
document.querySelector<HTMLElement>("#overlay-btn")!.addEventListener("click", () => location.reload());
window.__HF = { world, camera, map };
