import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMarketFrame } from "./types";

const fixture = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "desk-frames.jsonl"),
  "utf8",
);
const lines = fixture.split("\n").filter(Boolean);

describe("parseMarketFrame (against real captured desk frames)", () => {
  it("parses every channel present in the fixture", () => {
    const chs = new Set(lines.map((l) => (JSON.parse(l) as { ch: string }).ch));
    expect(chs).toEqual(new Set(["ctx", "candle", "cvd", "liq"]));
    for (const line of lines) {
      expect(parseMarketFrame(JSON.parse(line))).not.toBeNull();
    }
  });

  it("preserves key values (BTC ctx roundtrip)", () => {
    const f = parseMarketFrame(JSON.parse(lines[0]!));
    expect(f).not.toBeNull();
    if (f?.ch !== "ctx") throw new Error("expected ctx");
    expect(f.coin).toBe("BTC");
    expect(f.mark).toBe(77152.0);
    expect(f.funding_hourly).toBeCloseTo(1.25e-5, 12);
  });

  it("candle OHLC stays coherent", () => {
    const f = parseMarketFrame(JSON.parse(lines[1]!));
    if (f?.ch !== "candle") throw new Error("expected candle");
    expect(f.bar.h).toBeGreaterThanOrEqual(f.bar.l);
    expect(f.bar.c).toBeGreaterThanOrEqual(f.bar.l);
    expect(f.bar.c).toBeLessThanOrEqual(f.bar.h);
  });

  it("accepts relay-wrapped frames with an extra src field", () => {
    const wrapped = JSON.parse(lines[2]!) as Record<string, unknown>;
    const f = parseMarketFrame({ ...wrapped, src: "live" });
    expect(f).not.toBeNull();
  });

  it("rejects non-L1 channels and malformed payloads", () => {
    expect(parseMarketFrame(null)).toBeNull();
    expect(parseMarketFrame("x")).toBeNull();
    expect(parseMarketFrame({ ch: "book", coin: "BTC", as_of_ms: 1 })).toBeNull();
    expect(parseMarketFrame({ ch: "whale", snapshot: {} })).toBeNull();
    expect(parseMarketFrame({ ch: "ctx", coin: "BTC" })).toBeNull();
    expect(parseMarketFrame(JSON.parse('{"ch":"candle","coin":"BTC","tf":"1m","bar":{"t":1,"o":1,"h":1,"l":1,"c":1}}'))).toBeNull();
    expect(parseMarketFrame(JSON.parse('{"ch":"liq","event":{"coin":"BTC"}}'))).toBeNull();
  });
});
