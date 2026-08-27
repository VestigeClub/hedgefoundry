// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { BuildController, type BuildCallbacks } from "./build";
import type { Input } from "../engine/input";
import { Camera } from "../engine/camera";
import { generateMap } from "../world/mapgen";
import { World } from "../sim/world";

interface FakeInput {
  keys: Set<string>;
  mouse: { x: number; y: number; left: boolean; middle: boolean; right: boolean };
  consumeWheel(): number;
}

/** BuildController over a real DOM bar with a stubbed Input (no mouse events). */
function harness(): { build: BuildController; keys: Set<string> } {
  const { map, feeds } = generateMap({ width: 64, height: 64, seed: 3, startClearRadius: 12, poolClusters: 6 });
  const world = new World({ map, feeds, seed: 3, startCapital: 1_000_000 });
  const keys = new Set<string>();
  const fake: FakeInput = {
    keys,
    mouse: { x: 0, y: 0, left: false, middle: false, right: false },
    consumeWheel: () => 0,
  };
  const camera = new Camera(800, 600);
  const noop = (): void => {};
  const cb: BuildCallbacks = { onSelect: noop, onPlace: noop, onDeny: noop, toast: noop };
  const bar = document.createElement("div");
  document.body.appendChild(bar);
  return { build: new BuildController(world, camera, fake as unknown as Input, cb, bar), keys };
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
