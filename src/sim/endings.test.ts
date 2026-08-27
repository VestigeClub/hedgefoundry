/**
 * Endings (P3). What closes a run and what the end-game report reads back:
 * the IPO wins, an overrun HQ or a 10 s margin call loses (with the reason
 * stamped), the Fund Office is permanent, and bro kills are tallied.
 */
import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { BRO_STATS, COSTS, HIRE_QUOTA, ROADSHOW_ALPHA_NEEDED, World, type EntityKind } from "./world";
import { bufferAdd } from "./production";

const DT = 33.3333;

function makeWorld(seed = 7, startCapital?: number): World {
  const { map, feeds } = generateMap({ width: 128, height: 128, seed, startClearRadius: 14, poolClusters: 25 });
  return new World({ map, feeds, seed, startCapital });
}

function findSpot(w: World, kind: EntityKind, sx: number, sy: number, win = 14): { x: number; y: number } {
  for (let y = sy - win; y <= sy + win; y++) {
    for (let x = sx - win; x <= sx + win; x++) {
      if (w.canPlace(kind, x, y) === null) return { x, y };
    }
  }
  throw new Error(`no spot for ${kind} near ${sx},${sy}`);
}

function powerNear(w: World, sx: number, sy: number): void {
  const v = findSpot(w, "vault", sx, sy, 2);
  w.placeEntity("vault", v.x, v.y);
}

function tick(w: World, seconds: number): void {
  const steps = Math.round((seconds * 1000) / DT);
  for (let i = 0; i < steps; i++) tickWorld(w, DT);
}

describe("endings", () => {
  it("wins by closing the roadshow", () => {
    const w = makeWorld(7, 50_000_000);
    w.spawnHQ();
    powerNear(w, 40, 40);
    const rs = w.placeEntity("roadshow", 40, 40)!;
    for (let i = 0; i < 4; i++) bufferAdd(rs.input!, "alpha", 1);
    w.hired = HIRE_QUOTA;
    rs.roadshow!.progress = ROADSHOW_ALPHA_NEEDED - 1;
    tick(w, 2);
    expect(w.state).toBe("won");
    expect(w.lossReason).toBeNull();
    expect(w.entities.has(rs.id)).toBe(true);
  });

  it("loses when the HQ is overrun", () => {
    const w = makeWorld();
    const hq = w.spawnHQ();
    expect(w.damageEntity(hq.id, 10_000)).toBe(true);
    expect(w.state).toBe("lost");
    expect(w.lossReason).toBe("hq");
    expect(w.entities.has(hq.id)).toBe(false);
    expect(w.timeline[w.timeline.length - 1]?.msg).toBe("HQ OVERRUN");
  });

  it("loses to a margin call after 10s at zero capital", () => {
    const w = makeWorld();
    w.spawnHQ();
    w.capital = 0;
    tick(w, 9);
    expect(w.state).toBe("playing");
    expect(w.lossReason).toBeNull();
    tick(w, 2);
    expect(w.state).toBe("lost");
    expect(w.lossReason).toBe("margin");
    expect(w.timeline[w.timeline.length - 1]?.msg).toBe("MARGIN CALL");
  });

  it("cannot demolish the HQ, and refunds nothing", () => {
    const w = makeWorld();
    const hq = w.spawnHQ();
    const capital = w.capital;
    expect(w.removeEntity(hq.id)).toBe(false);
    expect(w.entities.has(hq.id)).toBe(true);
    expect(w.capital).toBe(capital);
    expect(w.hqId).toBe(hq.id);
    // A normal building still goes, at half the build cost back.
    powerNear(w, 40, 40);
    const vault = w.placeEntity("vault", 40, 40)!;
    const before = w.capital;
    expect(w.removeEntity(vault.id)).toBe(true);
    expect(w.entities.has(vault.id)).toBe(false);
    expect(w.capital).toBe(before + Math.round(COSTS.vault * 0.5));
  });

  it("counts bro kills", () => {
    const w = makeWorld();
    w.spawnHQ();
    const bro = w.spawnBro("analyst", 40, 40)!;
    expect(w.damageEntity(bro.id, BRO_STATS.analyst.hp - 1)).toBe(false);
    expect(w.brosKilled).toBe(0);
    expect(w.damageEntity(bro.id, 1)).toBe(true);
    expect(w.brosKilled).toBe(1);
    expect(w.entities.has(bro.id)).toBe(false);
  });
});
