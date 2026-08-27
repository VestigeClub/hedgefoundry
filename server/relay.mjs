#!/usr/bin/env node
/**
 * HedgeFoundry market relay — READ-ONLY passthrough from a private
 * market-data desk. DESIGN.md §6.
 *
 * - One WebSocket client to the desk (broadcast-all; adds zero impact).
 * - Filters to the L1 subset: ctx · candle · cvd · liq, game coins only.
 *   Drops book/bookheat (L2 depth), whale, brief, fbar, agent, health, watch.
 * - Re-serves as SSE to game clients, plus:
 *     /seed   — realized vol from 2 days of 1m BTC candles (world seeding)
 *     /health — relay liveness
 *     /       — serves dist/ statically (LAN demo = one process)
 *
 * Zero deps (Node 22+: global WebSocket + fetch). The game client falls back
 * to its embedded SimFeed when this relay is unreachable.
 *
 * Usage: node server/relay.mjs [--port 7891] [--desk ws://desk-host:5299/ws/stream]
 * Env: PORT, DESK_WS, DESK_REST (see .env.example). Flags beat env.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

/** CLI flag value for `--name value`, or undefined. */
function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const PORT = Number(flag("port") ?? process.env.PORT ?? 7891);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  console.error(`[relay] bad --port: ${flag("port")}`);
  process.exit(1);
}
// No hardcoded desk endpoint — see .env.example; null = static + SSE only.
const DESK_WS = flag("desk") ?? process.env.DESK_WS ?? null;
const DESK_REST = process.env.DESK_REST ?? null;

const KEEP = new Set(["ctx", "candle", "cvd", "liq"]);
const COINS = new Set(["BTC", "ETH", "SOL"]); // the game's universe; a live desk streams dozens
const clients = new Set();
let lastFrameAt = 0;

function push(line) {
  const data = `data: ${line}\n\n`;
  for (const c of clients) {
    try {
      c.write(data);
    } catch {
      clients.delete(c);
    }
  }
}

// Exponential reconnect: 1s → 2s → 4s → 8s → 15s (capped), reset on open.
const BACKOFF_STEPS = [1_000, 2_000, 4_000, 8_000, 15_000];
let backoffIdx = 0;
function retryDesk() {
  const delay = BACKOFF_STEPS[Math.min(backoffIdx, BACKOFF_STEPS.length - 1)];
  backoffIdx++;
  console.warn(`[relay] desk closed; retrying in ${delay / 1000}s`);
  setTimeout(connectDesk, delay);
}

function connectDesk() {
  if (!DESK_WS) return;
  let ws;
  try {
    ws = new WebSocket(DESK_WS);
  } catch (err) {
    console.error(`[relay] desk connect failed: ${err.message}`);
    retryDesk();
    return;
  }
  // A black-holed endpoint never fires open/close; force a close so the
  // backoff loop keeps trying instead of going permanently deaf.
  const connectTimer = setTimeout(() => {
    try {
      ws.close();
    } catch {}
  }, 10_000);
  ws.onopen = () => {
    clearTimeout(connectTimer);
    backoffIdx = 0;
    console.log(`[relay] desk connected: ${DESK_WS}`);
  };
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const f = m && typeof m === "object" ? m : null;
    if (f && typeof f.ch === "string" && KEEP.has(f.ch) && COINS.has(f.coin)) {
      lastFrameAt = Date.now();
      push(JSON.stringify({ ...f, src: "live" }));
    }
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
  ws.onclose = () => {
    clearTimeout(connectTimer);
    retryDesk();
  };
}

const SEED_TTL_MS = 5 * 60_000;
const seedCache = { at: 0, p: null };

/** Memoized seed: repeated client fetches must not re-pull days of candles. */
function cachedSeed() {
  if (seedCache.p && Date.now() - seedCache.at < SEED_TTL_MS) return seedCache.p;
  seedCache.at = Date.now();
  seedCache.p = seedJson().catch((err) => {
    seedCache.p = null; // failures are not cached; next request retries
    throw err;
  });
  return seedCache.p;
}

async function seedJson() {
  if (!DESK_REST) throw new Error("no desk configured (set DESK_REST)");
  const days = 2;
  const end = Date.now();
  const start = end - days * 86_400_000;
  const url = `${DESK_REST}/api/candles?coin=BTC&tf=1m&start_ms=${start}&end_ms=${end}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`desk candles ${res.status}`);
  const json = await res.json();
  const bars = Array.isArray(json?.bars) ? json.bars : [];
  const closes = bars.map((b) => b.c).filter((v) => typeof v === "number");
  if (closes.length < 2) throw new Error("not enough closes");
  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol =
    Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length) *
    Math.sqrt(365 * 24 * 60); // annualized from 1m bars
  const last = closes[closes.length - 1];
  return {
    src: "live",
    vol: Number(vol.toFixed(6)),
    last,
    coins: [{ coin: "BTC", last }],
    bars: closes.length,
  };
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function serveFile(rel, res) {
  // README tells readers to start the relay before building; a bare 404 reads
  // as a routing bug, so name the missing step.
  if (!fs.existsSync(DIST)) {
    res.writeHead(503);
    res.end("run npm run build first");
    return;
  }
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (u.pathname === "/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");
    clients.add(res);
    const hb = setInterval(() => {
      try {
        res.write(": hb\n\n");
      } catch {
        clearInterval(hb);
        clients.delete(res);
      }
    }, 15_000);
    req.on("close", () => {
      clearInterval(hb);
      clients.delete(res);
    });
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (u.pathname === "/seed") {
    try {
      const s = await cachedSeed();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(s));
    } catch (err) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
    return;
  }
  if (u.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    const ago = lastFrameAt ? Date.now() - lastFrameAt : null;
    // Freshness, not a latch: one old frame must not read as "connected" forever.
    res.end(JSON.stringify({ ok: true, deskConnected: ago !== null && ago < 10_000, lastFrameMsAgo: ago, clients: clients.size }));
    return;
  }
  if (u.pathname === "/") {
    serveFile("index.html", res);
    return;
  }
  serveFile(u.pathname.replace(/^\/+/, ""), res);
});

server.on("error", (e) => {
  console.error(`[relay] listen failed: ${e.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[relay] listening http://0.0.0.0:${PORT}`);
  console.log(`[relay] dist ${fs.existsSync(DIST) ? "present" : "ABSENT — run npm run build first"}`);
  if (!DESK_WS) console.log("[relay] live desk disabled (set DESK_WS)");
});
connectDesk();
