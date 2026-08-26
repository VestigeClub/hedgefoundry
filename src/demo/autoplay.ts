/**
 * Cinematic demo mode (DESIGN.md §7, M7) — `?demo` URL param.
 * A scripted autoplayer runs the game at 8× sim speed: finds the feed patch
 * nearest the HQ, builds a belt production rig anchored there, grants demo
 * research, defends with towers + briefs, hires bros, and launches the IPO
 * roadshow. No UI interaction needed.
 */
import type { Camera } from "../engine/camera";
import { World, HIRE_QUOTA, type Entity } from "../sim/world";
import { applyTech } from "../sim/research";
import { bufferAdd } from "../sim/production";

const DEMO_SPEED = 4;

export function demoSpeed(): number {
  return DEMO_SPEED;
}

interface Spot {
  kind: "miner" | "cleaner" | "analytics" | "factory" | "research" | "printer" | "funding" | "vault" | "tower" | "roadshow";
  dx: number;
  dy: number;
}

const DEMO_TECHS = ["tape-speed-1", "fuel-tier-1", "factory-speed-1", "tower-damage-1", "comp-discount-1"];

export class Demo {
  private phase: "rig" | "defense" | "hire" | "ipo" | "done" = "rig";
  private stepMs = 0;
  private built: Entity[] = [];
  private anchor: { x: number; y: number } | null = null;

  constructor(
    private readonly world: World,
    private readonly camera: Camera,
  ) {
        // Demo economy: enough capital to build + hit the hire quota.
    world.capital = 100_000_000;
    // Demo pressure: light waves so the show reads as defense, not doom.
    world.evolution = 0;
    world.broSpawnTimerMs = 120_000;
  }

  update(dtMs: number): void {
    if (this.world.state !== "playing") {
      if (this.phase !== "done") this.phase = "done";
      return;
    }
    this.stepMs += dtMs;
    if (this.stepMs < 1_000) return;
    this.stepMs = 0;

    const w = this.world;
    const hq = w.entities.get(w.hqId);
    if (!hq) return;
    // Demo economy (every phase): the capital cap (1M + vaults) would
    // starve the build, the 250-hire run, AND the $2M roadshow; the demo
    // tops up as its "seed round" story beat.
    if (w.capital < 5_000_000) w.capital = 50_000_000;
    switch (this.phase) {
      case "rig":
        if (this.rigStep(hq)) this.phase = "defense";
        break;
      case "defense":
        if (this.defenseStep(hq)) this.phase = "hire";
        break;
      case "hire":
        this.hireStep();
        break;
      case "ipo":
        // Keep the roadshow fueled (and re-placed if bros chew it) while the
        // IPO countdown plays; only stop when the sim actually wins.
        if (w.state === "won") this.phase = "done";
        else this.ipoStep();
        break;
      case "done":
        break;
    }
  }

  /** Feed patch nearest the HQ with room for the rig. */
  private pickAnchor(): { x: number; y: number } | null {
    const w = this.world;
    const hq = w.entities.get(w.hqId);
    if (!hq) return null;
    const hcx = hq.x + 2;
    const hcy = hq.y + 2;
    const patches = [...w.feeds].sort(
      (a, b) => Math.abs(a.x - hcx) + Math.abs(a.y - hcy) - (Math.abs(b.x - hcx) + Math.abs(b.y - hcy)),
    );
    for (const f of patches) {
      for (let y = f.y; y < f.y + f.h - 1 && y < w.map.h - 10; y++) {
        for (let x = f.x; x < f.x + f.w - 1 && x < w.map.w - 24; x++) {
          if (x < 1 || y < 1) continue;
          if (w.canPlace("miner", x, y) === null) return { x, y };
        }
      }
    }
    return null;
  }

  private rigStep(_hq: Entity): boolean {
    const w = this.world;
    if (this.anchor === null) {
      this.anchor = this.pickAnchor();
      if (!this.anchor) return false; // no feed with room — retry next beat
    }
    const mx = this.anchor.x;
    const my = this.anchor.y;

    // Main row: miner → cleaner → analytics → factory, belts filling the
    // exact gap between ACTUAL placements (pools may shift machines).
    const miner = this.getOrPlace("miner", mx, my, true);
    if (!miner) return false;
    const cleaner = this.getOrPlace("cleaner", miner.x + 7, my, true);
    if (!cleaner) return false;
    this.beltRow(miner.x + 2, cleaner.x - 1, my);
    const analytics = this.getOrPlace("analytics", cleaner.x + 4, my, true);
    if (!analytics) return false;
    this.beltRow(cleaner.x + 3, analytics.x - 1, my);
    const factory = this.getOrPlace("factory", analytics.x + 4, my, true);
    if (!factory) return false;
    this.beltRow(analytics.x + 3, factory.x - 1, my);

    // Off-row support buildings (probed both axes). Layout (cx = cleaner.x):
    //   [vault][printerA]  [funding]  [printerB]     [research]
    //   cx-3     cx-1     cx+2..cx+3  cx+5      fx-1..fx+1 (row y-3 / y-4)
    this.getOrPlace("research", factory.x - 1, my - 4, false);
    this.getOrPlace("funding", cleaner.x + 2, my - 3, false);
    this.getOrPlace("vault", cleaner.x - 3, my - 3, false);
    this.getOrPlace("vault", factory.x + 3, my, false);
    const pa = this.getOrPlace("printer", cleaner.x - 1, my - 3, false);
    const pb = this.getOrPlace("printer", cleaner.x + 5, my - 3, false);
    if (pa) this.loadPrinter(pa);
    if (pb) this.loadPrinter(pb);

    // Traders bridge machine/belt edges into research + funding. Funding is
    // fed from the BELT (machine outputs are drained by belts first).
    const traders: Array<{ x: number; y: number; dir: "N" | "E" | "S" | "W" }> = [
      { x: factory.x, y: my - 1, dir: "S" }, // factory → research (alpha)
      { x: factory.x - 1, y: my - 1, dir: "S" }, // belt row 3 → research (signal)
      { x: cleaner.x + 3, y: my - 1, dir: "S" }, // belt row 2 → funding (clean)
    ];
    for (const t of traders) {
      if (w.canPlace("trader", t.x, t.y) === null) {
        const e = w.placeEntity("trader", t.x, t.y);
        if (e) {
          e.trader!.dir = t.dir;
          this.built.push(e);
        }
      }
    }

    return true;
  }

  private loadPrinter(p: Entity): void {
    if ((p.machine!.crafter.input.items.clean ?? 0) < 4) bufferAdd(p.machine!.crafter.input, "clean", 6);
    if ((p.machine!.crafter.input.items.signal ?? 0) < 4) bufferAdd(p.machine!.crafter.input, "signal", 6);
  }

  /** Existing entity of the kind, or place (with ±2 probe). Retry-safe. */
  private getOrPlace(kind: Spot["kind"], x: number, y: number, row: boolean): Entity | null {
    const w = this.world;
    // Only reuse an existing entity of this kind if it is near the spot —
    // otherwise multiple towers/vaults would collapse onto the first one.
    for (const e of w.entities.values()) {
      if (e.kind === kind && Math.abs(e.x - x) + Math.abs(e.y - y) <= 4) return e;
    }
    if (w.canPlace(kind, x, y) === null) return w.placeEntity(kind, x, y);
    for (let o = -3; o <= 3; o++) {
      if (w.canPlace(kind, x + o, y) === null) return w.placeEntity(kind, x + o, y);
      if (!row && w.canPlace(kind, x, y + o) === null) return w.placeEntity(kind, x, y + o);
    }
    return null;
  }

  /** Fill a straight eastward belt row between two x positions (inclusive). */
  private beltRow(x0: number, x1: number, y: number): void {
    const w = this.world;
    for (let x = x0; x <= x1; x++) {
      if (w.canPlace("belt", x, y) === null) {
        const b = w.placeEntity("belt", x, y);
        if (b) {
          b.belt!.dir = "E";
          this.built.push(b);
        }
      }
    }
  }

    private defenseStep(_hq: Entity): boolean {
    const w = this.world;
        if (!this.anchor) return false;
    const mx = this.anchor.x;
    const my = this.anchor.y;
    // Towers ring the RIG (that's where the bros raid), plus an HQ pair.
    // Row my-5 keeps clear of the rig's own vault/printer/research row.
    const towers: Array<[number, number]> = [
      [mx - 2, my - 5],
      [mx + 6, my - 5],
      [mx + 14, my - 5],
      [mx + 21, my - 5],
      [mx - 4, my + 1],
      [mx + 23, my + 1],
      [mx + 2, my + 4],
      [mx + 17, my + 4],
    ];
    for (const [x, y] of towers) {
      const e = this.getOrPlace("tower", x, y, false);
      if (e) e.input!.items.brief = 8; // demo ammo sustain
    }
    this.getOrPlace("vault", mx + 4, my - 6, false);
    this.getOrPlace("vault", mx + 18, my - 6, false);
    // HQ towers for the 500hp office (all four sides).
    const hqE = w.entities.get(w.hqId);
    if (hqE) {
      for (const [x, y] of [
        [hqE.x - 3, hqE.y - 2],
        [hqE.x + 5, hqE.y - 2],
        [hqE.x - 3, hqE.y + 4],
        [hqE.x + 5, hqE.y + 4],
      ] as const) {
        const t = this.getOrPlace("tower", x, y, false);
        if (t) t.input!.items.brief = 8;
      }
      this.getOrPlace("vault", hqE.x - 1, hqE.y - 4, false);
    }
    // Keep printers fed (demo pacing: briefs must flow).
    for (const e of w.entities.values()) {
      if (e.kind === "printer") this.loadPrinter(e);
    }
    return true;
  }

  private hireStep(): void {
    const w = this.world;
    // Demo pacing: keep evolution near zero (impact from the rig would
    // otherwise scale waves to doom levels).
    if (w.evolution > 0.05) w.evolution = 0.05;
    // Demo pacing: cap wave frequency at 90s sim (spawnBros would reset
    // to 50s otherwise) so the defense reads as victory, not doom.
    if (w.broSpawnTimerMs < 90_000) w.broSpawnTimerMs = 90_000;
    // Demo research: grant one tech per beat through the normal tree.
    for (const id of DEMO_TECHS) {
      if (!w.researched.has(id)) {
        applyTech(w, id);
        return;
      }
    }
    // Headhunter beat: the towers shred edge-marching waves before they
    // reach the fund, so the demo recruiter delivers candidates straight to
    // the rig door (hired the same beat, before any tower can fire).
    if (this.anchor) {
      for (const type of ["analyst", "trader"] as const) {
        const spot = { x: this.anchor.x - 6, y: this.anchor.y + 1 };
        if (w.map.isPassable(spot.x, spot.y)) {
          const bro = w.spawnBro(type, spot.x, spot.y);
          if (bro) w.hireBro(bro.id);
        }
      }
    }
    if (w.hired >= HIRE_QUOTA) this.phase = "ipo";
  }

  private ipoStep(): boolean {
    const w = this.world;
    // Dedup: one roadshow; re-place only if bros destroyed it.
    const existing = [...w.entities.values()].find((e) => e.kind === "roadshow");
    if (existing) {
      existing.input!.items.alpha = 16; // hand-fed countdown fuel
      return true;
    }
    const factory = [...w.entities.values()].find((e) => e.kind === "factory");
    if (!factory) return false;
    // Roadshow near the factory first (fed from its bottom edge)…
    const spots: Array<[number, number]> = [
      [factory.x, factory.y + 5],
      [factory.x - 2, factory.y + 5],
      [factory.x + 2, factory.y + 5],
      [factory.x, factory.y + 7],
      [factory.x - 3, factory.y + 6],
      [factory.x + 3, factory.y + 6],
      [factory.x, factory.y - 6],
      [factory.x - 2, factory.y - 6],
      [factory.x + 2, factory.y - 6],
    ];
    let rs: Entity | null = null;
    for (const [x, y] of spots) {
      if (w.canPlace("roadshow", x, y) === null) {
        rs = w.placeEntity("roadshow", x, y);
        if (rs) break;
      }
    }
    // …else anywhere on the map (the demo hand-feeds alpha anyway).
    if (!rs) {
      for (let y = 8; y < w.map.h - 8 && !rs; y += 2) {
        for (let x = 8; x < w.map.w - 8 && !rs; x += 2) {
          if (w.canPlace("roadshow", x, y) === null) rs = w.placeEntity("roadshow", x, y);
        }
      }
    }
    if (!rs) return false; // genuinely no 4×4 floor anywhere: retry next beat
    // Power the fallback roadshow: a vault beside it (range 7).
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [2, -1],
      [-1, 0],
      [rs.w, 0],
      [-1, 1],
      [rs.w, 1],
    ] as const) {
      if (w.canPlace("vault", rs.x + dx, rs.y + dy) === null) {
        w.placeEntity("vault", rs.x + dx, rs.y + dy);
        break;
      }
    }
    // Feeding trader from the factory's bottom edge when the geometry lines
    // up; the alpha top-up below is the demo-pacing safety net.
    if (Math.abs(rs.x - factory.x) <= 1 && w.canPlace("trader", factory.x + 1, factory.y + 3) === null) {
      const t = w.placeEntity("trader", factory.x + 1, factory.y + 3);
      if (t) t.trader!.dir = "N";
    }
    rs.input!.items.alpha = 16;
    return true;
  }

  /** Drift the camera to frame the rig + HQ. */
  frame(): void {
    const w = this.world;
    const hq = w.entities.get(w.hqId);
    if (!hq) return;
    const a = this.anchor ?? { x: hq.x, y: hq.y };
    const tx = (a.x + 12) * 32;
    const ty = (a.y + 6) * 32;
    this.camera.x += (tx - this.camera.x - innerWidth / 2) * 0.02;
    this.camera.y += (ty - this.camera.y - innerHeight / 2) * 0.02;
    this.camera.zoom += (0.75 - this.camera.zoom) * 0.02;
  }
}
