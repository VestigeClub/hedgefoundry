/**
 * End-game report (DESIGN.md §9, M7). Rendered into the game-over overlay:
 * a P&L table plus a capital-arc sparkline recorded at ~10s intervals.
 */
import { HIRE_QUOTA, KIND_LABEL, type World } from "../sim/world";

export interface HistoryPoint {
  t: number; // sim ms
  capital: number;
  alpha: number;
}

export interface Report {
  points: HistoryPoint[];
  brosKilled: number;
}

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

export function renderReport(w: World, report: Report): string {
  const peak = report.points.reduce((m, p) => Math.max(m, p.capital), w.capital);
  const runMin = Math.floor(w.timeMs / 60_000);
  const runSec = Math.floor((w.timeMs % 60_000) / 1000);
  const built = new Map<string, number>();
  for (const e of w.entities.values()) built.set(e.kind, (built.get(e.kind) ?? 0) + 1);

  const rows: Array<[string, string]> = [
    ["RUN TIME", `${runMin}m ${runSec}s`],
    ["CAPITAL AT END", fmt(w.capital)],
    ["CAPITAL PEAK", fmt(peak)],
    ["ALPHA MINED", `${w.totals.alpha}`],
    ["CLEAN DATA", `${w.totals.clean}`],
    ["SIGNALS", `${w.totals.signal}`],
    ["LEGAL BRIEFS", `${w.totals.brief}`],
    ["BROS HIRED", `${w.hired} / ${HIRE_QUOTA}`],
    ["BROS TERMINATED", `${report.brosKilled}`],
    ["RESEARCH", `${w.researched.size} techs`],
  ];
  for (const [kind, n] of built) rows.push([KIND_LABEL[kind as keyof typeof KIND_LABEL] ?? kind, `${n}`]);

  const table = rows
    .map(([k, v]) => `<div class="r-row"><span>${k}</span><span>${v}</span></div>`)
    .join("");
  const svg = sparklineSvg(report.points);
  return `${table}${svg}`;
}

/** 220×48 SVG sparkline of the capital arc. */
function sparklineSvg(points: HistoryPoint[]): string {
  const W = 220;
  const H = 48;
  if (points.length < 2) return "";
  const max = Math.max(...points.map((p) => p.capital), 1);
  const step = W / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - 3 - (p.capital / max) * (H - 6)).toFixed(1)}`)
    .join(" ");
  return `<svg class="r-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="#00e68c" stroke-width="1.5"/></svg>`;
}
