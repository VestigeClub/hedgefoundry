/**
 * M1 boot: canvas + terminal-dark grid render.
 * Engine proper (camera, input, entities) lands in M1 follow-ups.
 */
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;

const TILE = 24;
const GRID_COLOR = "#13202e";
const BG = "#0a0e14";

function sizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function render(): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  // Grid: quant-terminal floor (DESIGN.md §8 palette).
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= innerWidth; x += TILE) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, innerHeight);
  }
  for (let y = 0; y <= innerHeight; y += TILE) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(innerWidth, y + 0.5);
  }
  ctx.stroke();

  requestAnimationFrame(render);
}

addEventListener("resize", sizeCanvas);
sizeCanvas();
render();
