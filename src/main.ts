/**
 * Boot: engine loop + camera + input + tile renderer on a generated map,
 * with the market feed driving the ticker tape. DESIGN.md M1/M2.
 */
import "./style.css";
import { Camera } from "./engine/camera";
import { Input } from "./engine/input";
import { Loop } from "./engine/loop";
import { drawMap } from "./engine/renderer";
import { FeedClient, fetchWorldSeed, relayBase } from "./market/feed";
import { generateMap } from "./world/mapgen";
import { TileMap } from "./world/tilemap";
import { Ticker } from "./ui/ticker";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;

const WORLD_SEED = 1337;
const MAP_W = 256;
const MAP_H = 256;

const camera = new Camera(innerWidth, innerHeight);
const input = new Input(canvas);
const map: TileMap = generateMap({
  width: MAP_W,
  height: MAP_H,
  seed: WORLD_SEED,
  startClearRadius: 24,
  poolClusters: 40,
});

const ticker = new Ticker(
  document.querySelector<HTMLElement>("#ticker")!,
  document.querySelector<HTMLElement>("#feed-chip")!,
);

const feed = new FeedClient(relayBase(), WORLD_SEED, {
  onFrame: (f) => ticker.onFrame(f),
  onStatus: (s) => ticker.setStatus(s),
});

// World seed from the relay (realized vol) — consumed by world-gen in M3.
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
    feed.advanceSim(dtMs); // no-op while the relay is live
  },
  render: (dt) => {
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

    drawMap(ctx, map, camera);
  },
});

addEventListener("resize", sizeCanvas);
sizeCanvas();
loop.start();
