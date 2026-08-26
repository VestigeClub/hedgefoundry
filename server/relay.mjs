#!/usr/bin/env node
/**
 * HedgeFoundry market relay — READ-ONLY passthrough from a private
 * market-data desk. DESIGN.md §6.
 *
 * - One WebSocket client to the desk (broadcast-all; adds zero impact).
 * - Filters to the L1 subset: ctx · candle · cvd · liq. Drops book/bookheat
 *   (L2 depth), whale, brief, fbar, agent, health, watch.
 * - Re-serves as SSE to game clients, plus:
 *     /seed   — realized vol from 2 days of 1m BTC candles (world seeding)
 *     /health — relay liveness
 *     /       — serves dist/ statically (LAN demo = one process)
 *
 * Zero deps (Node 24: global WebSocket + fetch). The game client falls back
 * to its embedded SimFeed when this relay is unreachable.
 *
 * Usage: node server/relay.mjs [--port 7891] [--desk ws://desk-host:5299/ws/stream]
 * Env: PORT, DESK_WS, DESK_REST.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const PORT = Number(process.env.PORT ?? 7891);
const DESK_WS = process.env.DESK_WS ?? "ws://desk-host:5299/ws/stream";
const DESK_REST = process.env.DESK_REST ?? "http://desk-host:5299";

const KEEP = new Set(["ctx", "candle", "cvd", "liq"]);
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

function connectDesk() {
  let ws;
  try {
    ws = new WebSocket(DESK_WS);
  } catch (err) {
    console.error(`[relay] desk connect failed: ${err.message}`);
    setTimeout(connectDesk, 3000);
    return;
  }
  ws.onopen = () => console.log(`[relay] the desk connected: ${DESK_WS}`);
  ws.onmessage = (ev) => {
    lastFrameAt = Date.now();
    let m;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const f = m && typeof m === "object" ? m : null;
    if (f && typeof f.ch === "string" && KEEP.has(f.ch)) {
      push(JSON.stringify({ ...f, src: "live" }));
    }
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
  ws.onclose = () => {
    console.warn("[relay] the desk closed; reconnecting in 3s");
    setTimeout(connectDesk, 3000);
  };
}

async function seedJson() {
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
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
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
      const s = await seedJson();
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
    res.end(JSON.stringify({ ok: true, deskConnected: lastFrameAt > 0, lastFrameMsAgo: lastFrameAt ? Date.now() - lastFrameAt : null, clients: clients.size }));
    return;
  }
  if (u.pathname === "/") {
    serveFile("index.html", res);
    return;
  }
  serveFile(u.pathname.replace(/^\/+/, ""), res);
});

server.listen(PORT, () => {
  console.log(`[relay] listening http://0.0.0.0:${PORT}`);
  console.log(`[relay] dist ${fs.existsSync(DIST) ? "present" : "ABSENT — run npm run build first"}`);
});
connectDesk();
