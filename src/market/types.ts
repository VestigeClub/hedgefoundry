/**
 * Market frame types — the L1 subset the relay forwards (DESIGN.md §6).
 * Field shapes come from the wire capture documented in the DESIGN wire
 * section, not from a machine-local fixture. Relay passes frames through with
 * an added `src` field ("live" | "sim"); the parser ignores unknown fields.
 */
export interface CtxFrame {
  ch: "ctx";
  coin: string;
  mark: number;
  oi_base: number;
  oi_usd: number;
  funding_hourly: number;
  ts_ms: number;
}

export interface CandleFrame {
  ch: "candle";
  coin: string;
  tf: string;
  bar: { t: number; o: number; h: number; l: number; c: number; v: number };
}

export interface CvdFrame {
  ch: "cvd";
  coin: string;
  venue: string;
  bucket: {
    t: number;
    buy_usd: number;
    sell_usd: number;
    delta_usd: number;
    cvd_usd: number;
    session_start_ms: number;
  };
}

export interface LiqFrame {
  ch: "liq";
  event: {
    t: number;
    coin: string;
    venue: string;
    side: string;
    price: number;
    qty: number;
    notional_usd: number;
    capture_t?: number;
    latency_ms?: number;
    source?: string;
  };
}

export type MarketFrame = CtxFrame | CandleFrame | CvdFrame | LiqFrame;

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Strict validation; returns null for anything not one of the four L1 channels. */
export function parseMarketFrame(raw: unknown): MarketFrame | null {
  if (!isObj(raw)) return null;
  switch (raw.ch) {
    case "ctx": {
      if (!isStr(raw.coin) || !isNum(raw.mark) || !isNum(raw.funding_hourly) || !isNum(raw.ts_ms)) return null;
      return {
        ch: "ctx",
        coin: raw.coin,
        mark: raw.mark,
        oi_base: isNum(raw.oi_base) ? raw.oi_base : 0,
        oi_usd: isNum(raw.oi_usd) ? raw.oi_usd : 0,
        funding_hourly: raw.funding_hourly,
        ts_ms: raw.ts_ms,
      };
    }
    case "candle": {
      if (!isStr(raw.coin) || !isStr(raw.tf) || !isObj(raw.bar)) return null;
      const b = raw.bar;
      if (!isNum(b.t) || !isNum(b.o) || !isNum(b.h) || !isNum(b.l) || !isNum(b.c) || !isNum(b.v)) return null;
      return { ch: "candle", coin: raw.coin, tf: raw.tf, bar: { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v } };
    }
    case "cvd": {
      if (!isStr(raw.coin) || !isStr(raw.venue) || !isObj(raw.bucket)) return null;
      const k = raw.bucket;
      if (!isNum(k.t) || !isNum(k.buy_usd) || !isNum(k.sell_usd) || !isNum(k.delta_usd) || !isNum(k.cvd_usd) || !isNum(k.session_start_ms)) return null;
      return {
        ch: "cvd",
        coin: raw.coin,
        venue: raw.venue,
        bucket: { t: k.t, buy_usd: k.buy_usd, sell_usd: k.sell_usd, delta_usd: k.delta_usd, cvd_usd: k.cvd_usd, session_start_ms: k.session_start_ms },
      };
    }
    case "liq": {
      if (!isObj(raw.event)) return null;
      const e = raw.event;
      if (!isNum(e.t) || !isStr(e.coin) || !isStr(e.venue) || !isStr(e.side) || !isNum(e.price) || !isNum(e.qty) || !isNum(e.notional_usd)) return null;
      return {
        ch: "liq",
        event: {
          t: e.t,
          coin: e.coin,
          venue: e.venue,
          side: e.side,
          price: e.price,
          qty: e.qty,
          notional_usd: e.notional_usd,
          ...(isNum(e.capture_t) ? { capture_t: e.capture_t } : {}),
          ...(isNum(e.latency_ms) ? { latency_ms: e.latency_ms } : {}),
          ...(isStr(e.source) ? { source: e.source } : {}),
        },
      };
    }
    default:
      return null;
  }
}
