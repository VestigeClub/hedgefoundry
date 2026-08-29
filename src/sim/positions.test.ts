import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { tickWorld } from "./update";
import { World } from "./world";
import { serializeWorld, deserializeWorld } from "./save";
import { IMPACT_PER_CLOSE, POSITION_LIFE_MS, POSITION_SIZE_USD } from "./positions";

const MAP_OPTS = { width: 128, height: 128, seed: 7, startClearRadius: 14, poolClusters: 25 };

/** HQ + a powered trading desk (funding desk 4 tiles away is a power source). */
function fundedWorld(capital = 1_000_000): World {
  const { map, feeds } = generateMap(MAP_OPTS);
  const w = new World({ map, feeds, seed: MAP_OPTS.seed, startCapital: capital });
  w.spawnHQ();
  w.tech.positions = 1;
  w.placeEntity("funding", 60, 60);
  w.placeEntity("trading", 64, 60);
  w.recomputePower();
  return w;
}

describe("trading desk positions", () => {
  it("refuses to open without a powered desk", () => {
    const { map, feeds } = generateMap(MAP_OPTS);
    const w = new World({ map, feeds, seed: MAP_OPTS.seed, startCapital: 1_000_000 });
    w.spawnHQ();
    expect(w.openPosition("BTC", "long", POSITION_SIZE_USD)).toBe("NO TRADING DESK — BUILD AND POWER ONE");
  });

  it("marks to market and settles a long", () => {
    const w = fundedWorld();
    const base = w.capital; // builds (funding + desk) already charged
    w.ingestPrice("BTC", 100);
    expect(w.openPosition("BTC", "long", POSITION_SIZE_USD)).toBeNull();
    expect(w.capital).toBe(base - POSITION_SIZE_USD);
    w.ingestPrice("BTC", 110);
    w.closePosition(w.positions[0]!.id);
    expect(w.positions).toHaveLength(0);
    expect(w.positionLog).toHaveLength(1);
    expect(w.capital).toBe(base + POSITION_SIZE_USD * 0.1);
  });

  it("settles a short when price falls", () => {
    const w = fundedWorld();
    const base = w.capital;
    w.ingestPrice("ETH", 100);
    w.openPosition("ETH", "short", POSITION_SIZE_USD);
    w.ingestPrice("ETH", 90);
    w.closePosition(w.positions[0]!.id);
    expect(w.capital).toBe(base + POSITION_SIZE_USD * 0.1);
  });

  it("auto-closes at maturity, keeps capital whole at entry price, leaks impact", () => {
    const w = fundedWorld();
    const impactBefore = w.totalImpact();
    w.ingestPrice("BTC", 100);
    w.openPosition("BTC", "short", POSITION_SIZE_USD);
    const afterOpen = w.capital;
    tickWorld(w, POSITION_LIFE_MS + 1000);
    expect(w.positions).toHaveLength(0);
    expect(w.positionLog).toHaveLength(1);
    expect(w.capital).toBe(afterOpen + POSITION_SIZE_USD); // pnl 0 at entry px
    // The tick's burn also leaks impact; the close's +2 lands on top of it.
    expect(w.totalImpact()).toBeGreaterThanOrEqual(impactBefore + IMPACT_PER_CLOSE);
  });

  it("enforces the position limit, margin, and tape", () => {
    const w = fundedWorld();
    w.ingestPrice("BTC", 100);
    w.ingestPrice("ETH", 100);
    for (let i = 0; i < 5; i++) {
      expect(w.openPosition(i % 2 ? "BTC" : "ETH", i % 2 ? "short" : "long", POSITION_SIZE_USD)).toBeNull();
    }
    expect(w.openPosition("BTC", "long", POSITION_SIZE_USD)).toBe("POSITION LIMIT — 5 OPEN");
    const broke = fundedWorld(POSITION_SIZE_USD - 1);
    broke.ingestPrice("BTC", 100);
    expect(broke.openPosition("BTC", "long", POSITION_SIZE_USD)).toBe("INSUFFICIENT CAPITAL");
    const noTape = fundedWorld();
    expect(noTape.openPosition("BTC", "long", POSITION_SIZE_USD)).toBe("NO MARKET DATA");
  });

  it("round-trips open positions through the save", () => {
    const w = fundedWorld();
    w.ingestPrice("BTC", 100);
    w.openPosition("BTC", "long", POSITION_SIZE_USD);
    const json = serializeWorld(w, MAP_OPTS);
    const r = deserializeWorld(json);
    expect(r.world.positions).toHaveLength(1);
    expect(r.world.positions[0]!.symbol).toBe("BTC");
    expect(r.world.positions[0]!.dir).toBe("long");
    expect(r.world.nextPositionId).toBe(w.nextPositionId);
    expect(r.world.prices["BTC"]).toBe(100);
  });
});
