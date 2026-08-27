/**
 * End-game report (DESIGN.md §9, M7). Rendered into the game-over overlay:
 * a P&L table, a capital-arc sparkline sampled at 10 s, the run's event
 * timeline, and two export paths — plain text for the clipboard and a PNG
 * snapshot of the panel itself.
 */
import { BRO_STATS, HIRE_QUOTA, KIND_LABEL, type BroType, type EntityKind, type World } from "../sim/world";

/** Marker class on the panel; `downloadReportPng` re-finds the panel by it. */
const PANEL_CLASS = "r-report";
/** The overlay is a small box: it shows the tail of the timeline, text gets all of it. */
const PANEL_EVENTS = 12;
const BRO_TYPES: readonly BroType[] = ["analyst", "trader", "md", "quant"];
const PNG_NAME = "hedgefoundry-report.png";
/** Device pixels per CSS pixel — the panel is small, the download should not be. */
const PNG_SCALE = 2;
const XHTML_NS = "http://www.w3.org/1999/xhtml";

const LOSS_LABEL: Record<NonNullable<World["lossReason"]>, string> = {
  margin: "MARGIN CALL",
  hq: "HQ OVERRUN",
};

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

function fmtClock(ms: number): string {
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

/** Report table, in display order: label + value per row. */
export function reportRows(w: World): Array<[string, string]> {
  const peakCapital = w.capHistory.reduce((m, p) => Math.max(m, p.capital), w.capital);
  const peakAlpha = w.capHistory.reduce((m, p) => Math.max(m, p.alpha), w.totals.alpha);
  const built: Partial<Record<EntityKind, number>> = {};
  for (const e of w.entities.values()) built[e.kind] = (built[e.kind] ?? 0) + 1;

  const rows: Array<[string, string]> = [];
  if (w.state === "won") rows.push(["OUTCOME", "IPO CLOSED"]);
  else if (w.lossReason) rows.push(["OUTCOME", LOSS_LABEL[w.lossReason]]);
  rows.push(
    ["RUN TIME", fmtClock(w.timeMs)],
    ["CAPITAL AT END", fmt(w.capital)],
    ["CAPITAL PEAK", fmt(peakCapital)],
    ["PEAK ALPHA", `${Math.floor(peakAlpha)}`],
    ["ALPHA MINED", `${w.totals.alpha}`],
    ["CLEAN DATA", `${w.totals.clean}`],
    ["SIGNALS", `${w.totals.signal}`],
    ["LEGAL BRIEFS", `${w.totals.brief}`],
    ["BROS HIRED", `${w.hired} / ${HIRE_QUOTA}`],
    ["BRO WAVES SURVIVED", `${w.waves}`],
    ["BROS TERMINATED", `${w.brosKilled}`],
    ["TECHS RESEARCHED", `${w.researched.size}`],
  );
  for (const type of BRO_TYPES) rows.push([`HIRED · ${BRO_STATS[type].label}`, `${w.hiresByType[type]}`]);
  for (const kind of Object.keys(built) as EntityKind[]) rows.push([KIND_LABEL[kind], `${built[kind]}`]);
  return rows;
}

/** The panel's markup: table rows, capital arc, event tail, action buttons. */
export function reportHtml(w: World): string {
  const rows = reportRows(w)
    .map(([k, v]) => `<div class="r-row"><span>${k}</span><span>${v}</span></div>`)
    .join("");
  const events = w.timeline
    .slice(-PANEL_EVENTS)
    .map((e) => `<div class="r-event"><span>${fmtClock(e.t)}</span><span>${e.msg}</span></div>`)
    .join("");
  const timeline = events ? `<div class="r-events">${events}</div>` : "";
  const actions =
    `<div class="r-actions"><button type="button" class="r-btn r-copy">COPY</button>` +
    `<button type="button" class="r-btn r-png">SAVE PNG</button></div>`;
  return `${rows}${sparklineSvg(w.capHistory)}${timeline}${actions}`;
}

/** Paint the report into `container` (the overlay's stats slot) and wire its buttons. */
export function renderReport(container: HTMLElement, w: World): void {
  container.classList.add(PANEL_CLASS);
  container.innerHTML = reportHtml(w);
  const copy = container.querySelector<HTMLButtonElement>(".r-copy")!;
  const png = container.querySelector<HTMLButtonElement>(".r-png")!;
  copy.addEventListener("click", () => {
    navigator.clipboard.writeText(reportText(w)).then(
      () => flash(copy, "COPIED"),
      () => flash(copy, "COPY FAILED"),
    );
  });
  png.addEventListener("click", downloadReportPng);
}

/** Plain-text run summary — what COPY puts on the clipboard. */
export function reportText(w: World): string {
  const rows = reportRows(w).map(([k, v]) => `${k.padEnd(20)} ${v}`);
  const events = w.timeline.map((e) => `${fmtClock(e.t).padStart(8)}  ${e.msg}`);
  return ["HEDGEFOUNDRY · RUN REPORT", ...rows, "", "TIMELINE", ...events, ""].join("\n");
}

/**
 * Rasterise the rendered panel and download it as a PNG. The panel subtree is
 * cloned with its computed styles inlined, wrapped in an SVG foreignObject so
 * the browser lays it out for us, then painted onto a 2× canvas.
 */
export function downloadReportPng(): void {
  const panel = document.querySelector<HTMLElement>(`.${PANEL_CLASS}`);
  if (!panel) throw new Error("report: nothing to export — render the report first");
  void paintPng(panel).catch((err: unknown) => console.error("[report] PNG export failed", err));
}

function flash(btn: HTMLButtonElement, msg: string): void {
  const label = btn.textContent ?? "";
  btn.textContent = msg;
  setTimeout(() => {
    btn.textContent = label;
  }, 1_200);
}

async function paintPng(panel: HTMLElement): Promise<void> {
  const rect = panel.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const img = await rasterise(panelSvg(panel, w, h));
  const canvas = document.createElement("canvas");
  canvas.width = w * PNG_SCALE;
  canvas.height = h * PNG_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("report: canvas 2d context unavailable");
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(PNG_SCALE, PNG_SCALE);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("report: canvas did not encode to PNG");
  saveBlob(blob, PNG_NAME);
}

/** The panel as a standalone SVG document, laid out at `w` × `h`. */
function panelSvg(panel: HTMLElement, w: number, h: number): string {
  const clone = panel.cloneNode(true) as HTMLElement;
  clone.setAttribute("xmlns", XHTML_NS);
  clone.setAttribute("style", `${styleText(getComputedStyle(panel))}width:${w}px;height:${h}px;`);
  inlineStyles(panel, clone);
  const body = new XMLSerializer().serializeToString(clone);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject width="${w}" height="${h}">${body}</foreignObject></svg>`
  );
}

/** Copy every computed property onto the clone: the snapshot paints without the page's CSS. */
function inlineStyles(src: Element, dst: Element): void {
  const kids = src.children;
  const clones = dst.children;
  for (let i = 0; i < kids.length; i++) {
    const a = kids.item(i);
    const b = clones.item(i);
    if (a && b) {
      b.setAttribute("style", styleText(getComputedStyle(a)));
      inlineStyles(a, b);
    }
  }
}

function styleText(cs: CSSStyleDeclaration): string {
  let out = "";
  for (const prop of cs) out += `${prop}:${cs.getPropertyValue(prop)};`;
  return out;
}

function rasterise(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("report: SVG snapshot failed to rasterise"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** 220×48 SVG sparkline of the capital arc. */
function sparklineSvg(history: World["capHistory"]): string {
  const W = 220;
  const H = 48;
  if (history.length < 2) return "";
  const max = Math.max(...history.map((p) => p.capital), 1);
  const step = W / (history.length - 1);
  const d = history
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - 3 - (p.capital / max) * (H - 6)).toFixed(1)}`)
    .join(" ");
  return `<svg class="r-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="#00e68c" stroke-width="1.5"/></svg>`;
}
