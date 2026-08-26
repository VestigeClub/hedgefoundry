import { describe, expect, it } from "vitest";
import { Camera, MAX_ZOOM, MIN_ZOOM } from "./camera";

function cam(): Camera {
  return new Camera(1280, 720);
}

describe("Camera", () => {
  it("screenToWorld / worldToScreen roundtrip", () => {
    const c = cam();
    c.x = 123.4;
    c.y = -56.7;
    c.zoom = 1.7;
    const w = c.screenToWorld(640, 360);
    const s = c.worldToScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(640, 9);
    expect(s.y).toBeCloseTo(360, 9);
  });

  it("zoomAt keeps the anchor world point fixed", () => {
    const c = cam();
    c.x = 500;
    c.y = 300;
    c.zoom = 1;
    const before = c.screenToWorld(400, 250);
    c.zoomAt(400, 250, 1.5);
    const after = c.screenToWorld(400, 250);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(c.zoom).toBeCloseTo(1.5, 9);
  });

  it("clamps zoom to [MIN_ZOOM, MAX_ZOOM]", () => {
    const c = cam();
    c.zoomAt(0, 0, 100);
    expect(c.zoom).toBe(MAX_ZOOM);
    c.zoomAt(0, 0, 0.0001);
    expect(c.zoom).toBe(MIN_ZOOM);
  });

  it("panByScreen moves the view by dx/zoom", () => {
    const c = cam();
    c.zoom = 2;
    c.panByScreen(100, 50);
    expect(c.x).toBeCloseTo(-50, 9);
    expect(c.y).toBeCloseTo(-25, 9);
  });

  it("visibleTiles covers exactly the view, inclusive", () => {
    const c = new Camera(640, 480);
    c.x = 0;
    c.y = 0;
    c.zoom = 1;
    expect(c.visibleTiles(32)).toEqual({ x0: 0, y0: 0, x1: 20, y1: 15 });
    // zoomed out → more tiles
    c.zoom = 0.5;
    expect(c.visibleTiles(32)).toEqual({ x0: 0, y0: 0, x1: 40, y1: 30 });
    // offset camera: boundaries align to floor/ceil
    c.x = 10;
    c.y = -3;
    const v = c.visibleTiles(32);
    expect(v.x0).toBe(0);
    expect(v.x1).toBe(41);
    expect(v.y0).toBe(-1);
  });
});
