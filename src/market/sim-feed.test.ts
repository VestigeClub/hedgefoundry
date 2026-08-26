import { describe, expect, it } from "vitest";
import { SimFeed, type SimFeedOptions } from "./sim-feed";
import { parseMarketFrame, type MarketFrame } from "./types";

const OPTS: SimFeedOptions = { seed: 99 };

function frames(opts: SimFeedOptions, calls: number, dtMs = 100): MarketFrame[] {
  const s = new SimFeed(opts);
  const out: MarketFrame[] = [];
  for (let i = 0; i < calls; i++) out.push(...s.advance(dtMs));
  return out;
}

describe("SimFeed", () => {
  it("is deterministic for the same seed and advance sequence", () => {
    expect(frames(OPTS, 200)).toEqual(frames(OPTS, 200));
  });

  it("differs across seeds", () => {
    expect(frames({ seed: 1 }, 50)).not.toEqual(frames({ seed: 2 }, 50));
  });

  it("emits only valid, parseable frames", () => {
    const all = frames(OPTS, 400);
    expect(all.length).toBeGreaterThan(0);
    for (const f of all) expect(parseMarketFrame(f)).not.toBeNull();
  });

  it("emits ctx frames at ~10/s (ticker liveliness)", () => {
    const all = frames(OPTS, 100, 100); // 100 steps × 100ms = 10s sim
    const ctx = all.filter((f) => f.ch === "ctx");
    expect(ctx.length).toBeGreaterThanOrEqual(95);
    expect(ctx.length).toBeLessThanOrEqual(100);
  });

  it("closes candle bars with coherent OHLC after a sim minute", () => {
    const all = frames(OPTS, 700, 100); // 70s sim → ≥1 minute rollover per coin
    const candles = all.filter((f) => f.ch === "candle");
    expect(candles.length).toBeGreaterThanOrEqual(3);
    for (const f of candles) {
      if (f.ch !== "candle") continue;
      expect(f.bar.h).toBeGreaterThanOrEqual(f.bar.l);
      expect(f.bar.h).toBeGreaterThanOrEqual(f.bar.o);
      expect(f.bar.l).toBeLessThanOrEqual(f.bar.o);
      expect(f.bar.c).toBeGreaterThanOrEqual(f.bar.l);
      expect(f.bar.c).toBeLessThanOrEqual(f.bar.h);
    }
  });

  it("emits cvd buckets periodically", () => {
    const all = frames(OPTS, 60, 100); // 6s sim
    expect(all.some((f) => f.ch === "cvd")).toBe(true);
  });

  it("emits liq events when tuned hot, and rarely by default", () => {
    const hot = frames({ seed: 5, liqPerMin: 60 }, 600, 100); // 60s, expect ~60
    expect(hot.filter((f) => f.ch === "liq").length).toBeGreaterThan(10);
    const cold = frames(OPTS, 600, 100);
    expect(cold.filter((f) => f.ch === "liq").length).toBeLessThan(10);
  });
});
