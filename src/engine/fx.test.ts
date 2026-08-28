import { describe, expect, it } from "vitest";
import { Fx } from "./fx";

const cam = { x: 0, y: 0, zoom: 1 };

describe("Fx pools", () => {
  it("expired particles return to the free list and stop counting active", () => {
    const fx = new Fx();
    fx.burst(100, 100, "#fff", 10, 90, 400);
    expect(fx.activeCount()).toBe(10);
    fx.update(700); // burst jitter stretches ttl up to 400×1.3
    expect(fx.activeCount()).toBe(0);
    // the same capacity is available again — pool reuse, not growth
    fx.burst(100, 100, "#fff", 10, 90, 400);
    expect(fx.activeCount()).toBe(10);
  });

  it("overflow bursts drop silently at the pool cap", () => {
    const fx = new Fx();
    for (let i = 0; i < 60; i++) fx.burst(0, 0, "#fff", 10, 1, 10_000);
    expect(fx.activeCount()).toBe(384);
  });

  it("trauma decays to zero and stops shaking", () => {
    const fx = new Fx();
    fx.addTrauma(1);
    fx.update(50);
    const early = Math.abs(fx.shakeX) + Math.abs(fx.shakeY);
    fx.update(3_000);
    expect(fx.trauma).toBe(0);
    expect(fx.shakeX).toBe(0);
    expect(fx.shakeY).toBe(0);
    expect(early).toBeGreaterThan(0);
  });

  it("trauma caps at 1 no matter how many hits land", () => {
    const fx = new Fx();
    for (let i = 0; i < 50; i++) fx.addTrauma(0.5);
    expect(fx.trauma).toBe(1);
  });

  it("floats and rings age out like particles", () => {
    const fx = new Fx();
    fx.floatText("+$250", "#0f0", 10, 10, 800);
    fx.ring(5, 5, "#0ff", 30, 500);
    expect(fx.activeCount()).toBe(2);
    fx.update(900);
    expect(fx.activeCount()).toBe(0);
  });

  it("clear() recycles every pool — NEW GAME starts from a still screen", () => {
    const fx = new Fx();
    fx.burst(0, 0, "#fff", 20, 1, 5_000);
    fx.floatText("x", "#fff", 0, 0, 5_000);
    fx.addTrauma(1);
    fx.clear();
    expect(fx.activeCount()).toBe(0);
    expect(fx.trauma).toBe(0);
    fx.update(16);
    expect(fx.shakeX).toBe(0);
  });

  it("draw() survives an empty pool (nothing to draw, nothing thrown)", () => {
    const fx = new Fx();
    const ctx = new Proxy({} as unknown as CanvasRenderingContext2D, {
      get: (t, p) => (p === "canvas" ? null : () => undefined),
      set: () => true,
    });
    fx.draw(ctx, cam);
  });
});
