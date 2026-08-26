/**
 * World tick orchestration (DESIGN.md §5.3–5.4). Deterministic: entities are
 * iterated in insertion order; all randomness flows through World.rng.
 *
 * Order: power → demand/multiplier → funding (capital in) → burn (capital
 * out) → miners → machines → belts → traders.
 */
import { DX, DY, type Dir, type Entity, type World } from "./world";
import { BRO_STATS, HIRE_QUOTA, IMPACT_CELL, ROADSHOW_ALPHA_NEEDED, burnOf, type BroType } from "./world";
import type { Item } from "./items";
import { bufferAdd, bufferCount, bufferTake } from "./production";
import { TECH_BY_ID, applyTech } from "./research";

export function tickWorld(w: World, dtMs: number): void {
  if (w.state !== "playing") return; // game over: freeze the sim
  w.timeMs += dtMs;
  w.recomputePower();
  updateImpact(w, dtMs);

  // Funding desks produce capital first (consumes fuel).
  for (const e of w.entities.values()) {
    if (e.kind === "funding") updateFunding(w, e, dtMs);
  }

  // Burn: demand scales with the brownout multiplier.
  w.capital = Math.max(0, w.capital - w.demandPerSec * (dtMs / 1000) * w.multiplier);
  checkMarginCall(w, dtMs);

  for (const e of w.entities.values()) {
    switch (e.kind) {
      case "miner":
        updateMiner(w, e, dtMs);
        break;
      case "cleaner":
      case "analytics":
      case "factory":
      case "printer":
      case "research":
        updateMachine(w, e, dtMs);
        break;
      case "belt":
        updateBelt(w, e, dtMs);
        break;
      case "trader":
        updateTrader(w, e, dtMs);
        break;
      case "tower":
        updateTower(w, e, dtMs);
        break;
      case "roadshow":
        updateRoadshow(w, e, dtMs);
        break;
    }
  }
  spawnBros(w, dtMs);
  updateBros(w, dtMs);
}

function updateFunding(w: World, e: Entity, dtMs: number): void {
  if (!w.powered.has(e.id)) return;
  const f = e.funding!;
  const TIERS = [
    { fuel: "clean", rate: 2, out: 40 },
    { fuel: "signal", rate: 4, out: 160 },
    { fuel: "alpha", rate: 2, out: 600 },
  ] as const;
  const tier = TIERS[Math.min(w.tech.fuelTier, TIERS.length - 1)]!;
  const want = tier.rate * (dtMs / 1000);
  const have = bufferCount(f.input, tier.fuel);
  const availRatio = want > 0 ? Math.min(1, have / want) : 0;
  f.fuelAcc += want;
  const whole = Math.floor(f.fuelAcc);
  const taken = Math.min(whole, have);
  bufferTake(f.input, tier.fuel, taken);
  f.fuelAcc -= taken;
  // Production runs continuously at the fuel-availability ratio; integer
  // consumption is just the bookkeeping rhythm.
  w.capital = Math.min(w.capitalCapacity(), w.capital + tier.out * (dtMs / 1000) * availRatio);
}

function updateMiner(w: World, e: Entity, dtMs: number): void {
  if (!w.powered.has(e.id)) return;
  const m = e.miner!;
  const richness = w.feedAt(e.x, e.y)?.richness ?? 0;
  if (richness <= 0) return; // placed off-patch: idle (shouldn't happen; canPlace guards)
  const speedMult = 1 + 0.25 * w.tech.minerSpeed;
  const yieldMult = 1 + 0.1 * w.tech.minerYield;
  m.rateAcc += 1 * richness * yieldMult * speedMult * (dtMs / 1000) * w.multiplier;
  while (m.rateAcc >= 1) {
    if (bufferAdd(m.output, "tape", 1) === 0) break; // output full; hold the fraction
    m.rateAcc -= 1;
    w.totals.tape += 1;
  }
  // Push buffered tape onto adjacent belts; remainder waits for traders.
  while (bufferCount(m.output, "tape") > 0 && pushToAdjacentBelt(w, e, "tape")) {
    bufferTake(m.output, "tape", 1);
  }
}

function updateMachine(w: World, e: Entity, dtMs: number): void {
  const powered = w.powered.has(e.id);
  const mult = powered ? w.multiplier : 0;
  const crafter = e.machine!.crafter;
  // Research desks idle without a target; machines scale with tech speed.
  if (crafter.recipe.id === "research" && !w.researchTarget) return;
  const speedMult = machineSpeedMult(w, e);
  const wasCrafting = crafter.crafting;
  crafter.tick(dtMs * speedMult, mult);
  if (crafter.recipe.id === "research") {
    if (!wasCrafting && crafter.crafting) {
      e.researchTarget = w.researchTarget;
    }
    if (wasCrafting && !crafter.crafting && e.researchTarget) {
      const target = e.researchTarget!;
      e.researchTarget = null;
      if (target && !w.researched.has(target)) {
        w.researchPoints += 1;
        const def = TECH_BY_ID.get(target);
        if (def && w.researchPoints >= def.cost) {
          applyTech(w, target);
          w.researchPoints = 0;
          w.setResearchTarget(null);
        }
      }
    }
  }
  if (wasCrafting && !crafter.crafting) {
    // Craft completed: move outputs onto adjacent belts; remainder stays in
    // the output buffer for traders.
    for (const [item, qty] of Object.entries(crafter.recipe.out)) {
      w.totals[item as Item] += qty!;
      for (let i = 0; i < qty!; i++) {
        if (!pushToAdjacentBelt(w, e, item as Item)) break;
        bufferTake(crafter.output, item as Item, 1);
      }
    }
  }
}

function machineSpeedMult(w: World, e: Entity): number {
  switch (e.kind) {
    case "cleaner":
      return 1 + 0.25 * w.tech.cleanerSpeed;
    case "analytics":
      return 1 + 0.25 * w.tech.analyticsSpeed;
    case "factory":
      // +0.5% per hired bro: talent runs the factory (DESIGN.md §5.7).
      return 1 + 0.25 * w.tech.factorySpeed + 0.005 * w.hired;
    default:
      return 1;
  }
}

const BELT_SPACING = 0.25;

/** Insert an item keeping the belt's ascending-pos order (head = last). */
function beltPush(e: Entity, item: Item, pos: number): void {
  const items = e.belt!.items;
  let i = 0;
  while (i < items.length && items[i]!.pos < pos) i++;
  items.splice(i, 0, { item, pos });
}

function updateBelt(w: World, e: Entity, dtMs: number): void {
  const b = e.belt!;
  const advance = b.speed * (1 + 0.25 * w.tech.tapeSpeed) * (dtMs / 1000);
  const items = b.items;
  // Front-to-back: front item (highest pos) tries to exit; others follow.
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    const ahead = i < items.length - 1 ? items[i + 1]! : null;
    const maxPos = ahead ? ahead.pos - BELT_SPACING : 1;
    const newPos = Math.min(it.pos + advance, Math.max(it.pos, maxPos));
    if (newPos >= 1 && !ahead) {
      if (tryBeltExit(w, e, it)) {
        items.pop();
        continue;
      }
      it.pos = 1 - 0.001;
    } else {
      it.pos = newPos;
    }
  }
}

/** Belt head → next belt or adjacent machine input. */
function tryBeltExit(w: World, e: Entity, it: { item: Item }): boolean {
  const dir = e.belt!.dir;
  const nx = e.x + DX[dir];
  const ny = e.y + DY[dir];
  const next = w.entityAt(nx, ny);
  if (!next) return false;
  if (next.kind === "belt") {
    if (beltTailRoom(next)) {
      beltPush(next, it.item, 0);
      return true;
    }
    return false;
  }
  if (next.machine) {
    return bufferAdd(next.machine.crafter.input, it.item, 1) > 0;
  }
  return false;
}

function beltTailRoom(e: Entity): boolean {
  const items = e.belt!.items;
  if (items.length === 0) return true;
  return items[0]!.pos >= BELT_SPACING;
}

/** Push one item from a machine/miner output onto any adjacent belt (E,S,W,N). Returns true if placed. */
function pushToAdjacentBelt(w: World, e: Entity, item: Item): boolean {
  const sides: Dir[] = ["E", "S", "W", "N"];
  for (const dir of sides) {
    // Adjacent tile on that side of the entity's rect (E: x+w, W: x-1, …).
    const nx = dir === "E" ? e.x + e.w : dir === "W" ? e.x - 1 : e.x;
    const ny = dir === "S" ? e.y + e.h : dir === "N" ? e.y - 1 : e.y;
    const b = w.entityAt(nx, ny);
    if (b?.kind === "belt" && beltTailRoom(b)) {
      beltPush(b, item, 0);
      return true;
    }
  }
  return false;
}

const TRADER_SWING_MS = 350;
const PICKUP_POS = 0.75;

function updateTrader(w: World, e: Entity, dtMs: number): void {
  const t = e.trader!;
  if (t.busyMs > 0) {
    t.busyMs -= dtMs;
    return;
  }
  t.cooldownMs -= dtMs;
  if (t.cooldownMs > 0) return;

  // Destination: opposite side. Check capacity before taking anything.
  const dest = w.entityAt(e.x - DX[t.dir], e.y - DY[t.dir]);
  let destOk = false;
  if (dest) {
    if (dest.kind === "belt") destOk = beltTailRoom(dest);
    else if (dest.machine) destOk = dest.machine.crafter.input.total < dest.machine.crafter.input.cap;
  }
  if (!destOk) return;

  // Source: adjacent tile in the arm direction.
  const src = w.entityAt(e.x + DX[t.dir], e.y + DY[t.dir]);
  let item: Item | null = null;
  if (src) {
    if (src.kind === "belt") {
      const items = src.belt!.items;
      const front = items[items.length - 1];
      if (front && front.pos >= PICKUP_POS) {
        items.pop();
        item = front.item;
      }
    } else if (src.machine) {
      const out = src.machine.crafter.output;
      for (const [it, qty] of Object.entries(out.items)) {
        if (qty! > 0) {
          bufferTake(out, it as Item, 1);
          item = it as Item;
          break;
        }
      }
    }
  }
  if (!item) return;
  if (!dest) return;
  if (dest.kind === "belt") {
    beltPush(dest, item, 0);
  } else if (dest.machine) {
    bufferAdd(dest.machine.crafter.input, item, 1);
  }
  t.cooldownMs = 2_000 / (1 + 0.25 * w.tech.traderSpeed);
  t.busyMs = TRADER_SWING_MS;
}

// ── Market impact (pollution) ────────────────────────────────────────────────

const IMPACT_EMIT_PER_BURN = 0.05; // impact units per burn per second
const IMPACT_DECAY = 0.98;
// Decay + 4-way spread must sum < 1 per tick or the field amplifies to
// infinity (0.98 + 4×0.004 = 0.996).
const IMPACT_SPREAD = 0.004;

function updateImpact(w: World, dtMs: number): void {
  const sec = dtMs / 1000;
  for (const e of w.entities.values()) {
    if (!w.powered.has(e.id)) continue;
    const burn = burnOf(e);
    if (burn <= 0) continue;
    const cx = Math.floor((e.x + e.w / 2) / IMPACT_CELL);
    const cy = Math.floor((e.y + e.h / 2) / IMPACT_CELL);
    if (cx < 0 || cy < 0 || cx >= w.impactW || cy >= w.impactH) continue;
    const idx = cy * w.impactW + cx;
    const added = burn * IMPACT_EMIT_PER_BURN * sec;
    w.impact[idx] = (w.impact[idx] ?? 0) + added;
    w.evolution = Math.min(1, w.evolution + added * 5e-5);
  }
  // diffuse + decay (new array per tick; 4k floats — fine at 30 Hz)
  const src = w.impact;
  const dst = new Float32Array(src.length);
  for (let cy = 0; cy < w.impactH; cy++) {
    for (let cx = 0; cx < w.impactW; cx++) {
      const i = cy * w.impactW + cx;
      let v = src[i]! * IMPACT_DECAY;
      if (cx > 0) v += src[i - 1]! * IMPACT_SPREAD;
      if (cx < w.impactW - 1) v += src[i + 1]! * IMPACT_SPREAD;
      if (cy > 0) v += src[i - w.impactW]! * IMPACT_SPREAD;
      if (cy < w.impactH - 1) v += src[i + w.impactW]! * IMPACT_SPREAD;
      dst[i] = v;
    }
  }
  w.impact = dst;
}

// ── Finance bros ─────────────────────────────────────────────────────────────

const BRO_CAP_BASE = 40;

function spawnBros(w: World, dtMs: number): void {
  w.broSpawnTimerMs -= dtMs;
  if (w.broSpawnTimerMs > 0) return;
  const broCount = countBros(w);
  const cap = Math.round(BRO_CAP_BASE * (0.5 + w.evolution));
  if (broCount >= cap) {
    w.broSpawnTimerMs = 10_000;
    return;
  }
  const n = Math.min(1 + Math.floor(w.evolution * 6), cap - broCount);
  for (let i = 0; i < n; i++) {
    const spot = edgeSpot(w);
    if (spot) w.spawnBro(broTypeFor(w), spot.x, spot.y);
  }
  w.broSpawnTimerMs = Math.max(20_000, 50_000 - w.evolution * 25_000);
}

function countBros(w: World): number {
  let n = 0;
  for (const e of w.entities.values()) if (e.kind === "bro") n++;
  return n;
}

function broTypeFor(w: World): BroType {
  const r = w.rng.float();
  if (w.evolution > 0.8 && r < 0.15) return "quant";
  if (w.evolution > 0.4 && r < 0.4) return "md";
  if (r < 0.75) return "analyst";
  return "trader";
}

function edgeSpot(w: World): { x: number; y: number } | null {
  for (let tries = 0; tries < 20; tries++) {
    const side = w.rng.int(0, 3);
    let tx = 0;
    let ty = 0;
    if (side === 0) {
      tx = w.rng.int(2, w.map.w - 3);
      ty = 2;
    } else if (side === 1) {
      tx = w.rng.int(2, w.map.w - 3);
      ty = w.map.h - 3;
    } else if (side === 2) {
      tx = 2;
      ty = w.rng.int(2, w.map.h - 3);
    } else {
      tx = w.map.w - 3;
      ty = w.rng.int(2, w.map.h - 3);
    }
    if (w.map.isPassable(tx, ty)) return { x: tx, y: ty };
  }
  return null;
}

function updateBros(w: World, dtMs: number): void {
  for (const e of [...w.entities.values()]) {
    if (e.kind === "bro") updateBro(w, e, dtMs);
  }
}

function updateBro(w: World, e: Entity, dtMs: number): void {
  const b = e.bro!;
  const stats = BRO_STATS[b.type];
  const sec = dtMs / 1000;

  // Attack the nearest combat entity if adjacent.
  let target: Entity | null = null;
  let bestD = Infinity;
  for (const other of w.entities.values()) {
    // Bros never target each other — they raid structures.
    if (other.id === e.id || other.hp === undefined || other.kind === "bro") continue;
    const d = distTiles(e, other);
    if (d < bestD) {
      bestD = d;
      target = other;
    }
  }
  if (target && bestD <= 1.7) {
    b.atkCdMs -= dtMs;
    if (b.atkCdMs <= 0) {
      w.damageEntity(target.id, stats.dmg);
      b.atkCdMs = 1_000;
    }
    return;
  }

  // Chase the nearest structure when close (direct pursuit; the impact
  // gradient alone stalls bros at the blob's local maximum).
  if (target && bestD <= 10) {
    const tcx = target.x + target.w / 2;
    const tcy = target.y + target.h / 2;
    let bdx = 0;
    let bdy = 0;
    let bd = Math.hypot(b.xf - tcx, b.yf - tcy);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = b.xf + dx;
      const ny = b.yf + dy;
      if (!w.map.isPassable(Math.floor(nx), Math.floor(ny))) continue;
      const d = Math.hypot(nx - tcx, ny - tcy);
      if (d < bd) {
        bd = d;
        bdx = dx;
        bdy = dy;
      }
    }
    b.xf += bdx * stats.speed * sec;
    b.yf += bdy * stats.speed * sec;
    e.x = Math.floor(b.xf);
    e.y = Math.floor(b.yf);
    return;
  }

  // Move: greedy toward the strongest nearby impact cell, with a gravity
  // term toward the HQ so early bros always march somewhere.
  let best = { dx: 0, dy: 0, score: w.impactAt(Math.floor(b.xf), Math.floor(b.yf)) };
  const hq = w.entities.get(w.hqId);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = Math.floor((b.xf + dx * IMPACT_CELL * 0.9) / IMPACT_CELL);
    const ny = Math.floor((b.yf + dy * IMPACT_CELL * 0.9) / IMPACT_CELL);
    if (nx < 0 || ny < 0 || nx >= w.impactW || ny >= w.impactH) continue;
    if (!w.map.isPassable(Math.floor(b.xf + dx * 1.5), Math.floor(b.yf + dy * 1.5))) continue;
    let score = w.impact[ny * w.impactW + nx] ?? 0;
    if (hq) {
      const hqCx = Math.floor((hq.x + hq.w / 2) / IMPACT_CELL);
      const hqCy = Math.floor((hq.y + hq.h / 2) / IMPACT_CELL);
      score += 0.02 / (1 + Math.abs(hqCx - nx) + Math.abs(hqCy - ny));
    }
    if (score > best.score) best = { dx, dy, score };
  }
  // Anti-stall: on a flat local maximum, take a random passable step.
  if (best.dx === 0 && best.dy === 0) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    for (let tries = 0; tries < 8; tries++) {
      const [dx, dy] = dirs[w.rng.int(0, 3)]!;
      if (w.map.isPassable(Math.floor(b.xf + dx), Math.floor(b.yf + dy))) {
        best = { dx, dy, score: best.score };
        break;
      }
    }
  }
  b.xf += best.dx * stats.speed * sec;
  b.yf += best.dy * stats.speed * sec;
  e.x = Math.floor(b.xf);
  e.y = Math.floor(b.yf);
}

function distTiles(a: Entity, b: Entity): number {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.hypot(ax - bx, ay - by);
}

// ── Defense, roadshow, defeat ────────────────────────────────────────────────

function updateTower(w: World, e: Entity, dtMs: number): void {
  if (!w.powered.has(e.id)) return;
  const t = e.tower!;
  t.atkCdMs -= dtMs;
  if (t.atkCdMs > 0) return;
  if (bufferCount(e.input!, "brief") <= 0) return;
  const range = 12 + w.tech.towerRange * 4;
  let target: Entity | null = null;
  let bestD = Infinity;
  for (const b of w.entities.values()) {
    if (b.kind !== "bro") continue;
    const d = distTiles(e, b);
    if (d <= range && d < bestD) {
      bestD = d;
      target = b;
    }
  }
  if (!target) return;
  bufferTake(e.input!, "brief", 1);
  w.damageEntity(target.id, 8 + w.tech.towerDamage * 8);
  t.atkCdMs = 500;
}

function updateRoadshow(w: World, e: Entity, dtMs: number): void {
  if (!w.powered.has(e.id)) return;
  if (w.hired < HIRE_QUOTA) return;
  const r = e.roadshow!;
  const before = Math.floor(r.progress);
  r.progress += (4 * dtMs) / 1000; // 4 alpha/s delivery rate
  if (Math.floor(r.progress) > before) {
    if (bufferCount(e.input!, "alpha") <= 0) {
      r.progress = before; // no fuel: hold progress
      return;
    }
    bufferTake(e.input!, "alpha", 1);
  }
  if (r.progress >= ROADSHOW_ALPHA_NEEDED) w.state = "won";
}

function checkMarginCall(w: World, dtMs: number): void {
  if (w.capital <= 0) {
    w.marginCallMs += dtMs;
    if (w.marginCallMs >= 10_000) w.state = "lost";
  } else {
    w.marginCallMs = 0;
  }
}
