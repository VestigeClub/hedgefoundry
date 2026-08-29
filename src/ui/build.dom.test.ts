// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BuildController, type BuildCallbacks } from "./build";
import type { Input } from "../engine/input";
import { Camera } from "../engine/camera";
import { generateMap } from "../world/mapgen";
import { TILE_SIZE } from "../world/tilemap";
import { World } from "../sim/world";

interface FakeInput {
  keys: Set<string>;
  mouse: { x: number; y: number; left: boolean; middle: boolean; right: boolean };
  consumeWheel(): number;
}

/** BuildController over a real DOM bar with a stubbed Input (no mouse events). */
function harness(): {
  build: BuildController;
  keys: Set<string>;
  toasts: string[];
  selected: (string | null)[];
  world: World;
  camera: Camera;
  mouse: FakeInput["mouse"];
} {
  const { map, feeds } = generateMap({ width: 64, height: 64, seed: 3, startClearRadius: 12, poolClusters: 6 });
  const world = new World({ map, feeds, seed: 3, startCapital: 1_000_000 });
  const keys = new Set<string>();
  const toasts: string[] = [];
  const selected: (string | null)[] = [];
  const fake: FakeInput = {
    keys,
    mouse: { x: 0, y: 0, left: false, middle: false, right: false },
    consumeWheel: () => 0,
  };
  const camera = new Camera(800, 600);
  const noop = (): void => {};
  const cb: BuildCallbacks = {
    onSelect: (e) => selected.push(e ? `${e.kind}#${e.id}` : null),
    onPlace: noop,
    onDeny: noop,
    toast: (m) => toasts.push(m),
  };
  const bar = document.createElement("div");
  document.body.appendChild(bar);
  return {
    build: new BuildController(world, camera, fake as unknown as Input, cb, bar),
    keys,
    toasts,
    selected,
    world,
    camera,
    mouse: fake.mouse,
  };
}

describe("build hotkeys", () => {
  it("arms a tool on one press and disarms on the next", () => {
    const { build, keys } = harness();
    keys.add("Digit1");
    build.update();
    keys.delete("Digit1");
    build.update();
    expect(build.tool).toBe("miner");

    keys.add("Digit1");
    build.update();
    keys.delete("Digit1");
    build.update();
    expect(build.tool).toBeNull();
  });

  it("holds one tool while the key is down (no per-frame toggling)", () => {
    const { build, keys } = harness();
    keys.add("Digit1");
    for (let i = 0; i < 10; i++) build.update();
    expect(build.tool).toBe("miner");
  });

  it("rotates once per R press, not once per frame", () => {
    const { build, keys } = harness();
    keys.add("KeyR");
    for (let i = 0; i < 10; i++) build.update();
    expect(build.rotate).toBe(1);
  });

  it("disarms on Escape", () => {
    const { build, keys } = harness();
    keys.add("Digit1");
    build.update();
    keys.delete("Digit1");
    build.update();
    expect(build.tool).toBe("miner");
    keys.add("Escape");
    build.update();
    expect(build.tool).toBeNull();
  });
});

describe("build hint", () => {
  it("advertises the demolish/refund path (audit B3)", () => {
    harness();
    const hint = document.querySelector(".build-hint");
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain("50% REFUND");
    expect(hint!.textContent).toContain("SPACE — PAUSE");
  });
});

describe("placement refusal", () => {
  /** Arming goes through the real key path because setTool toggles. */
  const tapKey = (keys: Set<string>, build: BuildController, code: string): void => {
    keys.add(code);
    build.update();
    keys.delete(code);
    build.update();
  };

  it("names the blocking entity and opens its inspector", () => {
    const { build, keys, toasts, selected, world, camera, mouse } = harness();
    let tx = -1;
    let ty = -1;
    for (let y = 1; y < 60 && tx < 0; y++) {
      for (let x = 1; x < 60; x++) {
        if (world.canPlace("belt", x, y) === null) {
          tx = x;
          ty = y;
          break;
        }
      }
    }
    expect(tx).toBeGreaterThan(0);
    const p = camera.worldToScreen(tx * TILE_SIZE + 4, ty * TILE_SIZE + 4);
    mouse.x = Math.round(p.x);
    mouse.y = Math.round(p.y);
    expect(build.hoverTile()).toEqual({ tx, ty });

    tapKey(keys, build, "Digit0");
    mouse.left = true;
    build.update();
    mouse.left = false;
    build.update();
    expect(world.canPlace("belt", tx, ty)).not.toBeNull();

    tapKey(keys, build, "Digit0");
    tapKey(keys, build, "Digit0");
    mouse.left = true;
    build.update();
    mouse.left = false;
    build.update();

    expect(toasts.at(-1)).toMatch(/BELT #\d+/);
    expect(selected.at(-1)).toMatch(/^belt#/);
  });
});
