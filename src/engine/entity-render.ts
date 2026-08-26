/** Entity rendering — code-drawn sprites, culled per entity, no asset pipeline. */
import type { Camera } from "./camera";
import { TILE_SIZE } from "../world/tilemap";
import { ITEM_COLOR } from "../sim/items";
import { DIRS, DX, DY, type Entity, type World } from "../sim/world";
import { PALETTE } from "./renderer";

const KIND_COLOR: Record<string, string> = {
  miner: "#22d3ee",
  cleaner: "#34d399",
  analytics: "#a78bfa",
  factory: "#fbbf24",
  printer: "#f472b6",
  research: "#94a3b8",
  funding: "#10b981",
  vault: "#2dd4bf",
     link: "#3b4a5c",
   belt: "#16222f",
   trader: "#e2e8f0",
   tower: "#fb7185",
   hq: "#38bdf8",
   roadshow: "#fbbf24",
   bro: "#f472b6",
 };

const KIND_GLYPH: Record<string, string> = {
  miner: "M",
  cleaner: "CL",
  analytics: "AN",
  factory: "SF",
  printer: "LP",
  research: "RD",
  funding: "FD",
  vault: "TV",
  link: "",
     belt: "",
   trader: "TR",
   tower: "CT",
   hq: "HQ",
   roadshow: "IPO",
   bro: "",
 };

const BRO_COLOR: Record<string, string> = {
  analyst: "#f472b6",
  trader: "#fbbf24",
  md: "#fb7185",
  quant: "#a78bfa",
};

const BRO_GLYPH: Record<string, string> = {
  analyst: "A",
  trader: "T",
  md: "M",
  quant: "Q",
};

interface Screen {
  ctx: CanvasRenderingContext2D;
  cam: Camera;
}

function sx(s: Screen, wx: number): number {
  return (wx - s.cam.x) * s.cam.zoom;
}
function sy(s: Screen, wy: number): number {
  return (wy - s.cam.y) * s.cam.zoom;
}
function sz(s: Screen, tiles: number): number {
  return tiles * TILE_SIZE * s.cam.zoom;
}

export function drawEntities(ctx: CanvasRenderingContext2D, world: World, cam: Camera, timeMs: number): void {
  const s: Screen = { ctx, cam };
  const v = cam.visibleTiles(TILE_SIZE);
  for (const e of world.entities.values()) {
    if (e.x + e.w <= v.x0 || e.y + e.h <= v.y0 || e.x > v.x1 || e.y > v.y1) continue;
    drawEntity(s, e, world.powered.has(e.id), timeMs);
  }
}

function drawEntity(s: Screen, e: Entity, powered: boolean, timeMs: number): void {
  if (e.kind === "belt") {
    drawBelt(s, e, timeMs);
    return;
  }
  if (e.kind === "link") {
    drawLink(s, e);
    return;
    }
  if (e.kind === "bro") {
    drawBro(s, e);
    return;
  }
  const { ctx } = s;
  const x = sx(s, e.x * TILE_SIZE);
  const y = sy(s, e.y * TILE_SIZE);
  const w = sz(s, e.w);
  const h = sz(s, e.h);
  const color = KIND_COLOR[e.kind]!;

  // body
  ctx.fillStyle = PALETTE.panel;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s.cam.zoom);
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 4);
  ctx.fill();
  ctx.stroke();

  // progress bar while crafting
  const crafter = e.machine?.crafter;
  if (crafter?.crafting) {
    const p = crafter.progressMs / crafter.recipe.timeMs;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x + 4, y + h - 6, (w - 8) * p, 3);
    ctx.globalAlpha = 1;
  }

  // glyph
  if (KIND_GLYPH[e.kind]) {
    ctx.fillStyle = color;
    ctx.font = `${Math.max(9, Math.floor(h * 0.28))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(KIND_GLYPH[e.kind]!, x + w / 2, y + h / 2);
  }

  // buffer pips: input along top, output along bottom-right
  const inBuf = e.machine?.crafter.input ?? e.funding?.input;
  if (inBuf) drawBufferPips(s, inBuf.items, x + 4, y + 3, w - 8, 5);
  const outBuf = e.machine?.crafter.output ?? e.miner?.output;
  if (outBuf) drawBufferPips(s, outBuf.items, x + 4, y + h - 10, w - 8, 5);

  // power dot
    if (e.kind !== "hq" && e.kind !== "roadshow" && e.kind !== "tower") {
    ctx.fillStyle = powered ? "#00e68c" : "#5a6b7f";
    ctx.beginPath();
    ctx.arc(x + w - 5, y + 5, Math.max(2, 3 * s.cam.zoom), 0, Math.PI * 2);
    ctx.fill();
  }

  // hp bar (combat entities)
  if (e.hp !== undefined && e.hp < e.maxHp!) {
    const bw = w - 8;
    ctx.fillStyle = "#1c2c3d";
    ctx.fillRect(x + 4, y + h - 9, bw, 3);
    ctx.fillStyle = e.hp / e.maxHp! > 0.35 ? "#00e68c" : "#fb7185";
    ctx.fillRect(x + 4, y + h - 9, bw * (e.hp / e.maxHp!), 3);
  }
}

function drawBro(s: Screen, e: Entity): void {
  const { ctx } = s;
  const b = e.bro!;
  const color = BRO_COLOR[b.type]!;
  const x = sx(s, b.xf * TILE_SIZE);
  const y = sy(s, b.yf * TILE_SIZE);
  const r = Math.max(4, sz(s, 0.35));
  ctx.fillStyle = PALETTE.panel;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s.cam.zoom);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `${Math.max(8, Math.floor(r * 0.8))}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(BRO_GLYPH[b.type]!, x, y + 1);
  // hp bar
  const bw = r * 2;
  ctx.fillStyle = "#1c2c3d";
  ctx.fillRect(x - r, y + r + 2, bw, 3);
  ctx.fillStyle = e.hp! / e.maxHp! > 0.35 ? "#00e68c" : "#fb7185";
  ctx.fillRect(x - r, y + r + 2, bw * (e.hp! / e.maxHp!), 3);
}

function drawBufferPips(
  s: Screen,
  items: Partial<Record<string, number>>,
  x: number,
  y: number,
  w: number,
  n: number,
): void {
  const { ctx } = s;
  const entries = Object.entries(items).filter(([, q]) => q! > 0);
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const item = entries[i % Math.max(1, entries.length)]?.[0];
    ctx.fillStyle = item ? ITEM_COLOR[item as keyof typeof ITEM_COLOR] ?? "#64748b" : "#1c2c3d";
    ctx.fillRect(x + i * step, y, step - 1, 3);
  }
}

function drawBelt(s: Screen, e: Entity, timeMs: number): void {
  const { ctx } = s;
  const x = sx(s, e.x * TILE_SIZE);
  const y = sy(s, e.y * TILE_SIZE);
  const t = sz(s, 1);
  const dir = e.belt!.dir;
  ctx.fillStyle = KIND_COLOR.belt!;
  ctx.fillRect(x + 1, y + 1, t - 2, t - 2);
  // animated chevrons
  ctx.strokeStyle = "#33485c";
  ctx.lineWidth = Math.max(1, s.cam.zoom);
  const dx = DX[dir];
  const dy = DY[dir];
  const offset = (timeMs * e.belt!.speed * 0.02) % 1;
  for (let i = 0; i < 2; i++) {
    const p = ((i + offset) % 1) * t;
    const cx = x + t / 2 + (p - t / 2) * dx;
    const cy = y + t / 2 + (p - t / 2) * dy;
    ctx.beginPath();
    ctx.moveTo(cx - 3 * dx - 2 * dy, cy - 3 * dy - 2 * dx);
    ctx.lineTo(cx + 3 * dx, cy + 3 * dy);
    ctx.lineTo(cx - 3 * dx + 2 * dy, cy - 3 * dy + 2 * dx);
    ctx.stroke();
  }
  // items
  for (const it of e.belt!.items) {
    const px = x + t / 2 + (it.pos - 0.5) * t * dx;
    const py = y + t / 2 + (it.pos - 0.5) * t * dy;
    ctx.fillStyle = ITEM_COLOR[it.item]!;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, t * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLink(s: Screen, e: Entity): void {
  const { ctx } = s;
  const x = sx(s, e.x * TILE_SIZE) + sz(s, 0.5);
  const y = sy(s, e.y * TILE_SIZE) + sz(s, 0.5);
  ctx.fillStyle = KIND_COLOR.link!;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2, sz(s, 0.14)), 0, Math.PI * 2);
  ctx.fill();
}
