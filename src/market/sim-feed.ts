import { Rng } from "../sim/rng";
import type { MarketFrame } from "./types";

export interface SimCoin {
  coin: string;
  base: number;
  /** Per-second volatility (std of log returns). */
  vol: number;
}

export interface SimFeedOptions {
  seed: number;
  coins?: SimCoin[];
  /** Expected liquidation events per minute. */
  liqPerMin?: number;
}

export const DEFAULT_COINS: SimCoin[] = [
  { coin: "BTC", base: 77_000, vol: 0.00045 },
  { coin: "ETH", base: 2_400, vol: 0.0007 },
  { coin: "SOL", base: 92, vol: 0.0011 },
];

interface CoinState {
  price: number;
  o: number;
  h: number;
  l: number;
  v: number;
  minT: number;
  buy: number;
  sell: number;
  cvd: number;
  funding: number;
  lastFundingAt: number;
  sessionStart: number;
  lastCvdAt: number;
}

const STEP_MS = 100;
const CVD_INTERVAL_MS = 5_000;
/** Cap ctx to the documented live cadence even when advance() sub-splits dt. */
const CTX_INTERVAL_MS = 100;
/** Fixed epoch: ts_ms reads as a real exchange stamp while staying deterministic. */
const EPOCH_MS = Date.UTC(2026, 7, 21);
const DAY_MS = 86_400_000;
/** Hourly funding walk: mean-reverting, bucketed, plausible magnitude. */
const FUNDING_PULL = 0.97;
const FUNDING_STEP = 5e-5;
const FUNDING_CAP = 0.001;

/**
 * Deterministic market simulator producing the same frame shapes as the desk
 * relay (DESIGN.md §6). Drives the ticker + world seeding when the relay is
 * unreachable (professor demo, offline play). All randomness flows through
 * the seeded Rng — same seed + same advance sequence = identical frames.
 */
export class SimFeed {
  private readonly rng: Rng;
  private readonly coins: SimCoin[];
  private readonly liqPerMin: number;
  private readonly state: Map<string, CoinState>;
  private t = EPOCH_MS;
  private lastCtxAt = EPOCH_MS - CTX_INTERVAL_MS;
  private rot = 0;

  constructor(opts: SimFeedOptions) {
    this.rng = new Rng(opts.seed);
    this.coins = opts.coins ?? DEFAULT_COINS;
    this.liqPerMin = opts.liqPerMin ?? 1.2;
    this.state = new Map();
    for (const c of this.coins) {
      this.state.set(c.coin, {
        price: c.base,
        o: c.base,
        h: c.base,
        l: c.base,
        v: 0,
        buy: 0,
        sell: 0,
        cvd: 0,
        funding: 0,
        lastFundingAt: -Infinity,
        // The epoch is a minute boundary, so bar/session stamps never read 0.
        minT: EPOCH_MS,
        sessionStart: Math.floor(EPOCH_MS / DAY_MS) * DAY_MS,
        lastCvdAt: -Infinity,
      });
    }
  }

  private gauss(): number {
    const u1 = Math.max(this.rng.float(), 1e-12);
    const u2 = this.rng.float();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** Advance the sim clock; returns the frames emitted during dtMs. */
  advance(dtMs: number): MarketFrame[] {
    const out: MarketFrame[] = [];
    const steps = Math.max(1, Math.round(dtMs / STEP_MS));
    const stepMs = dtMs / steps;
    for (let s = 0; s < steps; s++) this.step(stepMs, out);
    return out;
  }

  private step(dtMs: number, out: MarketFrame[]): void {
    this.t += dtMs;
    const now = this.t;
    const sec = dtMs / 1000;

    for (const c of this.coins) {
      const st = this.state.get(c.coin)!;
      st.price = Math.max(1e-6, st.price * (1 + c.vol * this.gauss() * Math.sqrt(sec)));
      st.h = Math.max(st.h, st.price);
      st.l = Math.min(st.l, st.price);

      const flow = Math.abs(this.gauss()) * c.base * 0.01 * sec;
      const buy = this.rng.chance(0.5) ? flow : 0;
      const sell = this.rng.chance(0.5) ? flow : 0;
      st.buy += buy;
      st.sell += sell;
      st.cvd += buy - sell;
      st.v += buy + sell;

      const minT = Math.floor(now / 60_000) * 60_000;
      if (minT > st.minT) {
        out.push({ ch: "candle", coin: c.coin, tf: "1m", bar: { t: st.minT, o: st.o, h: st.h, l: st.l, c: st.price, v: st.v } });
        st.minT = minT;
        st.o = st.h = st.l = st.price;
        st.v = 0;
        st.buy = 0;
        st.sell = 0;
      }

      if (now - st.lastCvdAt >= CVD_INTERVAL_MS) {
        out.push({
          ch: "cvd",
          coin: c.coin,
          venue: "sim",
          bucket: { t: st.minT, buy_usd: st.buy, sell_usd: st.sell, delta_usd: st.buy - st.sell, cvd_usd: st.cvd, session_start_ms: st.sessionStart },
        });
        st.lastCvdAt = now;
      }

      // Funding re-rerolls would flicker 30x/s on the tape; a 5s bucketed
      // mean-reverting walk reads like a real funding rate settling.
      if (now - st.lastFundingAt >= CVD_INTERVAL_MS) {
        const pulled = st.funding * FUNDING_PULL + this.gauss() * FUNDING_STEP;
        st.funding = Math.max(-FUNDING_CAP, Math.min(FUNDING_CAP, pulled));
        st.lastFundingAt = now;
      }

      if (this.rng.chance((this.liqPerMin / 60) * sec)) {
        const qty = this.rng.int(1, 500); // one draw: the desk fixture satisfies price*qty === notional
        out.push({
          ch: "liq",
          event: { t: now, coin: c.coin, venue: "sim", side: this.rng.chance(0.9) ? "long" : "short", price: st.price, qty, notional_usd: st.price * qty },
        });
      }
    }

    // At most one ctx per CTX_INTERVAL_MS of sim time (advance() may split dt
    // below STEP_MS), rotating coins — ~10/s total, matching live cadence.
    if (now - this.lastCtxAt >= CTX_INTERVAL_MS) {
      this.lastCtxAt = now;
      const coin = this.coins[this.rot % this.coins.length]!;
      this.rot++;
      const st = this.state.get(coin.coin)!;
      out.push({ ch: "ctx", coin: coin.coin, mark: st.price, oi_base: 0, oi_usd: 0, funding_hourly: st.funding, ts_ms: now });
    }
  }
}
