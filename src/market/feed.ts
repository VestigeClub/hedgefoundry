import { parseMarketFrame, type MarketFrame } from "./types";
import { SimFeed } from "./sim-feed";

export type FeedStatus = "connecting" | "live" | "sim";

export interface FeedEvents {
  onFrame: (f: MarketFrame) => void;
  onStatus: (s: FeedStatus) => void;
}

/**
 * Market feed client: EventSource to the relay (live desk passthrough, L1
 * subset). If the relay stays silent for 2 s, falls back to the embedded
 * deterministic SimFeed so the game always runs (professor demo = no relay).
 */
export class FeedClient {
  status: FeedStatus = "connecting";
  private es: EventSource | null = null;
  private sim: SimFeed | null = null;
  private fallbackTimer: number | null = null;
  private disposed = false;

  constructor(
    private readonly url: string,
        private readonly seed: number,
    private readonly events: FeedEvents,
  ) {
    try {
      const es = new EventSource(`${url}/stream`);
      this.es = es;
      es.onopen = () => this.armFallback();
      es.onmessage = (ev) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const f = parseMarketFrame(raw);
        if (f) {
          this.setStatus("live");
          this.disarmFallback();
          this.events.onFrame(f);
        }
      };
      es.onerror = () => this.armFallback();
    } catch {
      this.startSim();
    }
  }

  /** Drive the embedded simulator from the fixed sim tick. */
  advanceSim(dtMs: number): void {
    if (this.sim) {
      for (const f of this.sim.advance(dtMs)) this.events.onFrame(f);
    }
  }

  private armFallback(): void {
    if (this.fallbackTimer !== null || this.status === "sim" || this.disposed) return;
    this.fallbackTimer = window.setTimeout(() => this.startSim(), 2_000);
  }

  private disarmFallback(): void {
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private startSim(): void {
    if (this.status === "sim" || this.disposed) return;
    this.es?.close();
    this.es = null;
    this.sim = new SimFeed({ seed: this.seed });
    this.setStatus("sim");
  }

  private setStatus(s: FeedStatus): void {
    if (s !== this.status) {
      this.status = s;
      this.events.onStatus(s);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.es?.close();
    this.es = null;
    this.disarmFallback();
  }
}

export interface WorldSeed {
  src: "live" | "sim";
  /** Realized volatility (annualized) from 2 days of 1m BTC candles. */
  vol: number;
  last: number;
  coins: Array<{ coin: string; last: number }>;
}

const SIM_FALLBACK: WorldSeed = {
  src: "sim",
  vol: 0.62,
  last: 77_000,
  coins: [
    { coin: "BTC", last: 77_000 },
    { coin: "ETH", last: 2_400 },
    { coin: "SOL", last: 92 },
  ],
};

/** Fetch the world seed (realized vol) from the relay; sim fallback on failure. */
export async function fetchWorldSeed(url: string): Promise<WorldSeed> {
  try {
    const res = await fetch(`${url}/seed?days=2`, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) throw new Error(`seed ${res.status}`);
    return (await res.json()) as WorldSeed;
  } catch {
    return SIM_FALLBACK;
  }
}

/**
 * Relay base URL: if the game itself is served by the relay (port 7891), use
 * the same origin; otherwise assume the relay runs on the same host.
 */
export function relayBase(): string {
  if (location.port === "7891") return location.origin;
  return `http://${location.hostname || "localhost"}:7891`;
}
