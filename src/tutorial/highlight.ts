/** Canvas highlight (DESIGN.md §8a): pulsing cyan ring around a tile rect,
 * drawn in screen space. Reduced-motion clamps the pulse to static. */
import type { Camera } from "../engine/camera";
import { TILE_SIZE } from "../world/tilemap";
import type { TutorialRect } from "./steps";

const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function drawHighlight(ctx: CanvasRenderingContext2D, camera: Camera, target: TutorialRect, timeMs: number): void {
  const pulse = REDUCED ? 0.5 : Math.sin(timeMs / 400) * 0.5 + 0.5;
  const pad = (6 + pulse * 6) * camera.zoom;
  const s = camera.worldToScreen(target.x * TILE_SIZE, target.y * TILE_SIZE);
  ctx.strokeStyle = "#00c8ff";
  ctx.lineWidth = 2;
  ctx.shadowBlur = 8;
  ctx.shadowColor = "#00c8ff";
  ctx.strokeRect(s.x - pad, s.y - pad, target.w * TILE_SIZE * camera.zoom + pad * 2, target.h * TILE_SIZE * camera.zoom + pad * 2);
  ctx.shadowBlur = 0;
}
