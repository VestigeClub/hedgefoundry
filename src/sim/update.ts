/**
 * World tick orchestration (DESIGN.md §5.3–5.4). Deterministic: entities are
 * iterated in insertion order; all randomness flows through World.rng.
 *
 * Order: power → demand/multiplier → funding (capital in) → burn (capital
 * out) → miners → machines → belts → traders.
 */
import { DX, DY, type Dir, type Entity, type EntityKind, type World } from "./world";
import { BRO_STATS, HIRE_QUOTA, IMPACT_CELL, ROADSHOW_ALPHA_NEEDED, ROADSHOW_DELIVERY_PER_SEC, burnOf, type BroType } from "./world";
import { ITEMS, type Item } from "./items";
import { acceptsItem, bufferAdd, bufferCount, bufferTake, inputBufferOf, isTerminalSink, scaleFor, type Buffer } from "./production";
import { sellableFuels } from "./recipes";
import { TECH_BY_ID, applyTech } from "./research";
import { updatePositions } from "./positions";

export function tickWorld(w: World, dtMs: number): void {
  if (w.state !== "playing") return; // game over: freeze the sim
  w.timeMs += dtMs;
  w.rollWorking(); // last tick's work set drives this tick's power bill
  // 10 s P&L samples for the end-game curve; survives save/load, unlike
  // a counter in the UI layer.
  const lastSample = w.capHistory[w.capHistory.length - 1];
  if (!lastSample || w.timeMs - lastSample.t >= 10_000) {
    w.capHistory.push({ t: w.timeMs, capital: w.capital, alpha: w.totals.alpha });
  }
  w.recomputePower();
  updateImpact(w, dtMs);

  // Funding desks produce capital first (consumes fuel).
  for (const e of w.entities.values()) {
    if (e.kind === "funding") updateFunding(w, e, dtMs);
  }

  // Burn: the invoice is the invoice. Brownout throttles production, not the
  // bill — scaling the bill by the multiplier made capital decay asymptotic
  // and the margin call unreachable.
  w.capital = Math.max(0, w.capital - w.demandPerSec * (dtMs / 1000));
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
  updatePositions(w);
  updateBros(w, dtMs);
}

/**
 * Sell the best unlocked fuel in the buffer (DESIGN.md §5.6). A desk holds
 * whatever it is fed and pays for the richest kind it can actually burn.
 */
function updateFunding(w: World, e: Entity, dtMs: number): void {
  if (!w.powered.has(e.id)) return;
  const f = e.funding!;
  const dt = dtMs / 1000;
  const buf = f.input;
  f.selling = null;
  for (const fuel of sellableFuels(w.tech)) {
    const want = fuel.ratePerSec * dt;
    const have = bufferCount(buf, fuel.fuel);
    if (have <= 0) continue;
    const taken = Math.min(have, want);
    bufferTake(buf, fuel.fuel, taken);
    f.selling = fuel.fuel;
    w.working.add(e.id);
    const gained = fuel.capPerSec * dt * (taken / want);
    w.capital = Math.min(w.capitalCapacity(), w.capital + gained);
    // "+$N" floats: one pop per desk per 700 ms, min $1, so a 30-tick
    // income stream reads as money arriving, never as a strobe.
    f.floatAcc = (f.floatAcc ?? 0) + gained;
    if ((f.floatAcc ?? 0) >= 1 && w.timeMs - (f.floatAtMs ?? 0) >= 700) {
      w.cue("sale", e.x + e.w / 2, e.y + 0.2, Math.round(f.floatAcc));
      f.floatAcc = 0;
      f.floatAtMs = w.timeMs;
    }
    return;
  }
}

/**
 * Tape a miner pulls per second at richness 1.0. `FeedPatch.richness` is a
 * 1.0–2.2 yield *multiplier* (mapgen.ts), so a drill runs 4.0–8.8 tape/s —
 * enough for one miner to feed a cleaner (1 tape/s) with room for a second
 * lane, and still inside the ~15 items/s a belt lane carries (§5.2).
 */
const MINER_BASE_RATE = 4;

function updateMiner(w: World, e: Entity, dtMs: number): void {
  if (!w.powered.has(e.id)) return;
  const m = e.miner!;
  const richness = w.feedAt(e.x, e.y)?.richness ?? 0;
  if (richness <= 0) return; // placed off-patch: idle (shouldn't happen; canPlace guards)
  // Drain into belts first. A miner whose output has nowhere to go produces
  // nothing — and banks nothing, so a jam cannot pay out a burst when it clears.
  pushOutput(w, e, m.output, "tape");
  if (m.output.total >= m.output.cap) {
    m.rateAcc = 0;
    return;
  }
  w.working.add(e.id);
  const speedMult = 1 + 0.25 * w.tech.minerSpeed;
  const yieldMult = 1 + 0.1 * w.tech.minerYield;
  m.rateAcc += MINER_BASE_RATE * richness * yieldMult * speedMult * (dtMs / 1000) * w.multiplier;
  while (m.rateAcc >= 1) {
    if (bufferAdd(m.output, "tape", 1) === 0) break;
    m.rateAcc -= 1;
    w.totals.tape += 1;
  }
  // Move fresh tape out the same tick it is mined.
  pushOutput(w, e, m.output, "tape");
}

/** Move every unit of `item` from a buffer onto any adjacent belt. */
function pushOutput(w: World, e: Entity, buf: Buffer, item: Item): void {
  while (bufferCount(buf, item) > 0 && pushToAdjacentBelt(w, e, item)) bufferTake(buf, item, 1);
}

function updateMachine(w: World, e: Entity, dtMs: number): void {
  const powered = w.powered.has(e.id);
  const mult = powered ? w.multiplier : 0;
  const crafter = e.machine!.crafter;
  // Research desks idle without a target; machines scale with tech speed.
  if (crafter.recipe.id === "research" && !w.researchTarget) return;
  const speedMult = machineSpeedMult(w, e);
  const scale = scaleFor(e.kind, w.tech);
  const wasCrafting = crafter.crafting;
  crafter.tick(dtMs * speedMult, mult, scale);
  const produced = crafter.takeProduced();
  let researchWaste = false;
  if (crafter.recipe.id === "research") {
    if (!wasCrafting && crafter.crafting) {
      e.researchTarget = w.researchTarget;
    }
    if (produced && e.researchTarget) {
      const target = e.researchTarget;
      e.researchTarget = null;
      if (!w.researched.has(target)) {
        w.researchPoints += 1;
        const def = TECH_BY_ID.get(target);
        if (def && w.researchPoints >= def.cost) {
          applyTech(w, target);
          w.researchPoints = 0;
          w.setResearchTarget(null);
        }
      } else {
        // Another desk closed this tech mid-craft: the point never counted,
        // so the completion tick does not bill either (audit B2 — a lab was
        // charging 40 $/s for work the world threw away).
        researchWaste = true;
      }
    }
  }
  if (powered && crafter.crafting && !crafter.blocked && !researchWaste) w.working.add(e.id);
  if (produced) {
    // Credit only what was actually made, then move it onto adjacent belts;
    // the remainder waits in the output buffer for traders.
    for (const [item, qty] of Object.entries(produced)) {
      w.totals[item as Item] += qty!;
      for (let i = 0; i < qty!; i++) {
        if (!pushToAdjacentBelt(w, e, item as Item)) break;
        bufferTake(crafter.output, item as Item, 1);
      }
    }
  }
  // Drain whatever the completion tick could not place. A lane closes for one
  // instant all the time: the research desk caps each ingredient at half its
  // pad (§5.7), so a seventh alpha is a legal refusal. If the only push is the
  // one on the craft tick, those items never leave — the machine sits
  // `blocked` next to a belt that emptied moments later, its own input then
  // fills, and the refusal walks backwards up the chain: a jammed factory
  // stops buying signal, the analytics engines jam behind it, and the desk is
  // left holding six alpha and no signal, which is what froze a 50-minute run
  // at fuel tier 1 with research stuck at 4 points.
  // Iterated over the catalogue, not `Object.keys` of the buffer: this runs
  // for every machine on every tick and the tick loop allocates nothing.
  for (const item of ITEMS) pushOutput(w, e, crafter.output, item);
  if (crafter.blocked && crafter.output.total < crafter.output.cap) crafter.blocked = false;
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
/**
 * How long a belt head waits on a target that will not take the item before
 * the item is written off. Without this the head parks at `pos = 1` forever
 * (a destroyed or replaced sink leaves the lane pointing at nothing), tail
 * room fails lane-wide, and every machine behind it blocks for the rest of
 * the run — the audit's worst live defect. A lane that drains can be re-wired
 * by the player; a lane that petrifies cannot.
 */
const JAM_VOID_MS = 2_000;

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
      const exit = tryBeltExit(w, e, it);
      if (exit === "delivered") {
        items.pop();
        b.jamMs = 0;
        continue;
      }
      if (exit === "backpressure") {
        // The target will take the item and is only momentarily full (or the
        // next belt has no tail room). Hold the head indefinitely: the stall
        // walking upstream is the player's signal that the line is
        // over-supplied, and nothing is ever destroyed here.
        b.jamMs = 0;
        it.pos = 1 - 0.001;
        continue;
      }
      // "dead": nothing at the exit can ever take this item (target gone, or
      // it rejects the item type). Void it after a grace period so the lane
      // drains and rebuilds heal instead of petrifying (audit A1).
      const jamMs = (b.jamMs ?? 0) + dtMs;
      if (jamMs >= JAM_VOID_MS) {
        items.pop();
        b.jamMs = 0;
        w.writtenOff[it.item] += 1;
        w.cue("void", e.x + 0.5, e.y + 0.5);
        if (w.timeMs - w.lastWasteLogMs >= 10_000) {
          w.lastWasteLogMs = w.timeMs;
          w.logEvent(`WROTE OFF STRANDED ${it.item.toUpperCase()}`);
        }
      } else {
        b.jamMs = jamMs;
        it.pos = 1 - 0.001;
      }
    } else {
      it.pos = newPos;
    }
  }
}

/**
 * Belt head → next belt or adjacent machine input.
 * `backpressure` = the target takes this item and is only full right now —
 * hold the head and let the stall travel upstream. `dead` = no waiting can
 * deliver: the exit tile is empty, or the target rejects the item's type.
 * (Only `acceptsItem`'s type half may say `dead`: its pad-quota half is a
 * legal refusal that clears the moment someone consumes.)
 */
type BeltExit = "delivered" | "backpressure" | "dead";

function tryBeltExit(w: World, e: Entity, it: { item: Item }): BeltExit {
  const dir = e.belt!.dir;
  const next = w.entityAt(e.x + DX[dir], e.y + DY[dir]);
  if (!next) return "dead";
  if (next.kind === "belt") {
    if (beltTailRoom(next)) {
      beltPush(next, it.item, 0);
      return "delivered";
    }
    return "backpressure";
  }
  const buf = inputBufferOf(next);
  if (!buf) return "dead"; // a belt pointing at an office or a vault
  if (!acceptsItem(next, it.item, w.tech)) {
    // `acceptsItem` folds the pad quota into its answer; ask the type rule
    // again alone: right kind but full quota is backpressure, wrong kind is dead.
    const c = next.machine?.crafter;
    const typeOk = c
      ? (c.recipe.in[it.item] ?? 0) > 0
      : next.funding
        ? sellableFuels(w.tech).some((f) => f.fuel === it.item)
        : next.kind === "tower"
          ? it.item === "brief"
          : next.kind === "roadshow" && it.item === "alpha";
    return typeOk ? "backpressure" : "dead";
  }
  const added = bufferAdd(buf, it.item, 1);
  if (added > 0) return "delivered";
  // A full terminal sink writes surplus off rather than blocking the lane
  // (§5.7) — counted, never left to jam.
  if (isTerminalSink(next)) {
    w.writtenOff[it.item] += 1;
    return "delivered";
  }
  return "backpressure";
}

function beltTailRoom(e: Entity): boolean {
  const items = e.belt!.items;
  if (items.length === 0) return true;
  return items[0]!.pos >= BELT_SPACING;
}

const SIDES: readonly Dir[] = ["E", "S", "W", "N"];

/**
 * Trace a belt's downstream path; true if it re-enters the pushing machine's
 * rect within BELT_TRACE_HOPS. The old guard rejected only a belt pointing
 * straight back, so an E→S→W run looping into the machine passed — output
 * landed in a dead end and petrified there (audit A2, same failure shape as
 * the fixed self-strand bug).
 */
const BELT_TRACE_HOPS = 16;
function beltReturnsTo(w: World, head: Entity, e: Entity): boolean {
  let x = head.x;
  let y = head.y;
  let dir = head.belt!.dir;
  for (let hop = 0; hop < BELT_TRACE_HOPS; hop++) {
    x += DX[dir];
    y += DY[dir];
    const t = w.entityAt(x, y);
    if (!t) return false;
    if (t === e) return true;
    if (t.kind !== "belt") return false; // a real destination: the lane leads away
    dir = t.belt!.dir;
  }
  return false;
}

/**
 * Push one item from a machine/miner output onto an adjacent belt that leads
 * away from the machine (§5.2). Every belt tile touching the rect's sides is
 * an output port: the input side accepts delivery at any edge tile of the
 * target rect (`tryBeltExit` → `entityAt`), so output scans the whole side
 * too — a port pinned to one corner per edge made edge-centred belts
 * placeable, green in the ghost, and permanently deaf (audit A4).
 * A belt whose run leads back into the machine is an input lane, not output:
 * output dropped there can never be delivered (§5.2, A2).
 */
function pushToAdjacentBelt(w: World, e: Entity, item: Item): boolean {
  for (const dir of SIDES) {
    const along = dir === "E" || dir === "W" ? e.h : e.w;
    for (let off = 0; off < along; off++) {
      const nx = dir === "E" ? e.x + e.w : dir === "W" ? e.x - 1 : e.x + off;
      const ny = dir === "S" ? e.y + e.h : dir === "N" ? e.y - 1 : e.y + off;
      const b = w.entityAt(nx, ny);
      if (b?.kind !== "belt" || !beltTailRoom(b)) continue;
      if (beltReturnsTo(w, b, e)) continue;
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
    else {
      const b = inputBufferOf(dest);
      destOk = !!b && b.total < b.cap;
    }
  }
  if (!destOk) return;

  // Only pick up what the destination will actually accept — anything else
  // would be destroyed on delivery.
  const wants = (it: Item): boolean => dest!.kind === "belt" || acceptsItem(dest!, it, w.tech);

  // Source: adjacent tile in the arm direction.
  const src = w.entityAt(e.x + DX[t.dir], e.y + DY[t.dir]);
  let item: Item | null = null;
  if (src) {
    if (src.kind === "belt") {
      const items = src.belt!.items;
      const front = items[items.length - 1];
      if (front && front.pos >= PICKUP_POS && wants(front.item)) {
        items.pop();
        item = front.item;
      }
    } else if (src.machine) {
      const out = src.machine.crafter.output;
      for (const [it, qty] of Object.entries(out.items)) {
        if (qty! > 0 && wants(it as Item)) {
          bufferTake(out, it as Item, 1);
          item = it as Item;
          break;
        }
      }
    }
  }
  if (!item) return;
  if (dest!.kind === "belt") {
    beltPush(dest!, item, 0);
  } else {
    bufferAdd(inputBufferOf(dest!)!, item, 1);
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
/** Fraction of emitted impact that permanently saturates the market. */
const EVOLUTION_PER_IMPACT = 7e-5;

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
    // Market saturation tracks the fund's footprint: a 300 $/s burn base
    // reaches half saturation in ~8 minutes, which is the pacing the
    // 250-hire quota and the wave meter above are tuned against.
    w.evolution = Math.min(1, w.evolution + added * EVOLUTION_PER_IMPACT * w.pace);
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

/** Ceiling on the field at full market saturation (× 0.5 + evolution). */
const BRO_CAP_BASE = 24;

/**
 * Bro arrivals (DESIGN.md §5.7). The fund has to be able to afford them: a
 * wave of 10 every 8 s at saturation is ~75/min, and hiring 250 of them is
 * the win condition, so arrivals are metered to ~3/min cold and ~24/min at
 * full saturation — roughly 400 across a 25 minute run, which leaves room to
 * hire 250 and let compliance cull the rest.
 */
function spawnBros(w: World, dtMs: number): void {
  w.broSpawnTimerMs -= dtMs * w.pace;
  if (w.broSpawnTimerMs > 0) return;
  const broCount = countBros(w);
  const cap = Math.round(BRO_CAP_BASE * (0.5 + w.evolution));
  if (broCount >= cap) {
    w.broSpawnTimerMs = 10_000;
    return;
  }
  const n = Math.min(1 + Math.floor(w.evolution * 3), cap - broCount);
  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const spot = edgeSpot(w);
    if (spot && w.spawnBro(broTypeFor(w), spot.x, spot.y)) spawned++;
  }
  if (spawned > 0) {
    w.waves += 1;
    w.logEvent(`WAVE ${w.waves} · ${spawned} BROS`);
    const hq = w.entities.get(w.hqId);
    w.cue("wave", hq ? hq.x + 2 : w.map.w / 2, hq ? hq.y + 2 : w.map.h / 2, spawned);
  }
  w.broSpawnTimerMs = Math.max(4_000, 20_000 - w.evolution * 10_000);
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

/** A random map-edge tile clear of obstacles — where market stress walks in from. */
export function edgeSpot(w: World): { x: number; y: number } | null {
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

/** Structures a bro will attack: the office, and whatever shoots at it. */
const BRO_TARGETS: Partial<Record<EntityKind, true>> = { hq: true, tower: true };

function updateBros(w: World, dtMs: number): void {
  for (const e of [...w.entities.values()]) {
    if (e.kind === "bro") updateBro(w, e, dtMs);
  }
}

function updateBro(w: World, e: Entity, dtMs: number): void {
  const b = e.bro!;
  const stats = BRO_STATS[b.type];
  const sec = dtMs / 1000;

  // Bros march on the office. Only the office and the towers defending it
  // take damage (§5.8) — production out in the field is not a target, or the
  // fund would be punished for building anywhere the towers cannot reach.
  let target: Entity | null = null;
  let bestD = Infinity;
  for (const other of w.entities.values()) {
    if (other.id === e.id || other.hp === undefined || !BRO_TARGETS[other.kind]) continue;
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
  const prev = r.progress;
  const before = Math.floor(prev);
  r.progress = prev + ROADSHOW_DELIVERY_PER_SEC * (dtMs / 1000);
  if (Math.floor(r.progress) > before) {
    if (bufferCount(e.input!, "alpha") <= 0) {
      // Hold at the pre-tick value, not the integer floor: progress is a
      // continuous burn, and flooring on a dry step threw away every
      // fraction earned since the last unit — the bar visibly ran backwards
      // at marginal feed (audit A3).
      r.progress = prev;
      return;
    }
    bufferTake(e.input!, "alpha", 1);
  }
  if (r.progress >= ROADSHOW_ALPHA_NEEDED) w.state = "won";
}

function checkMarginCall(w: World, dtMs: number): void {
  if (w.capital <= 0) {
    w.marginCallMs += dtMs;
    // One klaxon per episode the moment deficit passes 4 s — the player
    // gets a fighting chance to see WHY the screen is bleeding red.
    if (w.marginCallMs >= 4_000 && w.marginCallMs - dtMs < 4_000) {
      const hq = w.entities.get(w.hqId);
      if (hq) w.cue("alarm", hq.x + 2, hq.y + 2);
    }
    if (w.marginCallMs >= 10_000) {
      w.state = "lost";
      w.lossReason = "margin";
      w.logEvent("MARGIN CALL");
    }
  } else {
    w.marginCallMs = 0;
  }
}
