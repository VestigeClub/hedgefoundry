/**
 * Research tree (DESIGN.md §5.5). Techs are researched at a Research Desk:
 * each craft of the "research" recipe (1 alpha + 1 signal) adds one point
 * toward the selected tech; at `cost` points the tech applies and the desk
 * moves on. Effects are flat level increments in World.tech.
 */
import type { World } from "./world";

export interface TechState {
  minerSpeed: number;
  minerYield: number;
  cleanerSpeed: number;
  analyticsSpeed: number;
  factorySpeed: number;
  tapeSpeed: number;
  traderSpeed: number;
  fuelTier: number;
  vaultCapLvl: number;
}

export const DEFAULT_TECH: TechState = {
  minerSpeed: 0,
  minerYield: 0,
  cleanerSpeed: 0,
  analyticsSpeed: 0,
  factorySpeed: 0,
  tapeSpeed: 0,
  traderSpeed: 0,
  fuelTier: 0,
  vaultCapLvl: 0,
};

export interface TechDef {
  id: string;
  label: string;
  desc: string;
  /** Research desk crafts required (each craft = 1 alpha + 1 signal). */
  cost: number;
  requires?: string[];
  effect: Partial<TechState>;
}

export const TECHS: TechDef[] = [
  { id: "tape-speed-1", label: "TAPE SPEED I", desc: "Belts +25%", cost: 5, effect: { tapeSpeed: 1 } },
  { id: "miner-speed-1", label: "MINER SPEED I", desc: "Miners +25%", cost: 6, effect: { minerSpeed: 1 } },
  { id: "miner-yield-1", label: "MINER YIELD I", desc: "Feed yield +10%", cost: 7, effect: { minerYield: 1 } },
  { id: "cleaner-speed-1", label: "CLEANER SPEED I", desc: "Cleaners +25%", cost: 6, effect: { cleanerSpeed: 1 } },
  { id: "trader-speed-1", label: "TRADER SPEED I", desc: "Traders +25%", cost: 6, effect: { traderSpeed: 1 } },
  { id: "tape-speed-2", label: "TAPE SPEED II", desc: "Belts +50%", cost: 10, requires: ["tape-speed-1"], effect: { tapeSpeed: 2 } },
  { id: "vault-cap-1", label: "VAULT CAPACITY I", desc: "+50K reserve", cost: 8, effect: { vaultCapLvl: 1 } },
  { id: "analytics-speed-1", label: "ANALYTICS SPEED I", desc: "Analytics +25%", cost: 9, effect: { analyticsSpeed: 1 } },
  { id: "fuel-tier-1", label: "FUEL TIER I", desc: "Funding burns SIGNALS · 160 CAP/s", cost: 10, effect: { fuelTier: 1 } },
  { id: "factory-speed-1", label: "FACTORY SPEED I", desc: "Factories +25%", cost: 12, effect: { factorySpeed: 1 } },
  { id: "vault-cap-2", label: "VAULT CAPACITY II", desc: "+100K reserve", cost: 14, requires: ["vault-cap-1"], effect: { vaultCapLvl: 2 } },
  { id: "fuel-tier-2", label: "FUEL TIER II", desc: "Funding burns ALPHA · 600 CAP/s", cost: 18, requires: ["fuel-tier-1"], effect: { fuelTier: 2 } },
];

export const TECH_BY_ID = new Map(TECHS.map((t) => [t.id, t]));

/** Apply a tech's effects; safe to call once (idempotent via researched set). */
export function applyTech(w: World, id: string): void {
  if (w.researched.has(id)) return;
  const t = TECH_BY_ID.get(id);
  if (!t) return;
  for (const [key, value] of Object.entries(t.effect)) {
    const k = key as keyof TechState;
    w.tech[k] = Math.max(w.tech[k], value ?? 0);
  }
  w.researched.add(id);
}
