// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateMap } from "../world/mapgen";
import { HIRE_QUOTA, World } from "../sim/world";
import { downloadReportPng, renderReport, reportRows, reportText } from "./report";

function makeWorld(): World {
  const { map, feeds } = generateMap({ width: 64, height: 64, seed: 5, startClearRadius: 12, poolClusters: 6 });
  return new World({ map, feeds, seed: 5, startCapital: 1_000_000 });
}

function value(rows: Array<[string, string]>, label: string): string | undefined {
  return rows.find(([k]) => k === label)?.[1];
}

function mount(w: World): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderReport(el, w);
  return el;
}

describe("end-game report", () => {
  it("refuses to export a PNG before the report is rendered", () => {
    document.querySelector(".r-report")?.remove();
    expect(() => downloadReportPng()).toThrow(/render the report first/);
  });

  it("tabulates hires by type, waves, techs, and peak alpha", () => {
    const w = makeWorld();
    w.hired = 3;
    w.hiresByType.analyst = 1;
    w.hiresByType.md = 2;
    w.capital = 250_000; // ended below the sampled peak
    w.brosKilled = 4;
    w.waves = 7;
    w.researched.add("fuel-tier-1");
    w.capHistory.push(
      { t: 10_000, capital: 400_000, alpha: 12 },
      { t: 20_000, capital: 900_000, alpha: 31 },
    );
    w.state = "won";

    const rows = reportRows(w);
    expect(value(rows, "OUTCOME")).toBe("IPO CLOSED");
    expect(value(rows, "HIRED · ANALYST")).toBe("1");
    expect(value(rows, "HIRED · MANAGING DIRECTOR")).toBe("2");
    expect(value(rows, "HIRED · QUANT")).toBe("0");
    expect(value(rows, "BROS HIRED")).toBe(`3 / ${HIRE_QUOTA}`);
    expect(value(rows, "BRO WAVES SURVIVED")).toBe("7");
    expect(value(rows, "BROS TERMINATED")).toBe("4");
    expect(value(rows, "CAPITAL AT END")).toBe("$250.0K");
    expect(value(rows, "TECHS RESEARCHED")).toBe("1");
    expect(value(rows, "PEAK ALPHA")).toBe("31");
    expect(value(rows, "CAPITAL PEAK")).toBe("$900.0K");
  });

  it("stamps the outcome with the loss reason", () => {
    const w = makeWorld();
    w.state = "lost";
    w.lossReason = "margin";
    expect(value(reportRows(w), "OUTCOME")).toBe("MARGIN CALL");
    w.lossReason = "hq";
    expect(value(reportRows(w), "OUTCOME")).toBe("HQ OVERRUN");
    // A run still in progress has no outcome row to report.
    const live = makeWorld();
    expect(value(reportRows(live), "OUTCOME")).toBeUndefined();
  });

  it("renders the timeline tail and wires the export buttons", () => {
    const w = makeWorld();
    for (let i = 0; i < 20; i++) {
      w.timeMs = i * 1_000;
      w.logEvent(`EVENT ${i}`);
    }
    const el = mount(w);

    expect(el.classList.contains("r-report")).toBe(true);
    const events = el.querySelectorAll(".r-event");
    expect(events.length).toBe(12);
    expect(events[0]?.textContent).toContain("EVENT 8");
    expect(events[11]?.textContent).toContain("EVENT 19");
    expect(el.querySelectorAll(".r-actions .r-btn").length).toBe(2);
    expect(el.querySelector(".r-copy")?.textContent).toBe("COPY");
    expect(el.querySelector(".r-png")?.textContent).toBe("SAVE PNG");
  });

  it("writes a plain-text summary carrying the full timeline", () => {
    const w = makeWorld();
    for (let i = 0; i < 20; i++) {
      w.timeMs = i * 1_000;
      w.logEvent(`EVENT ${i}`);
    }
    const text = reportText(w);
    const lines = text.split("\n");
    expect(lines[0]).toBe("HEDGEFOUNDRY · RUN REPORT");
    expect(text).toContain("TECHS RESEARCHED");
    expect(text).toContain("0m 0s  EVENT 0"); // panel truncates; text does not
    expect(text).toContain("0m 19s  EVENT 19");
    expect(lines.filter((l) => l.includes("EVENT ")).length).toBe(20);
  });
});
