import { describe, expect, it } from "vitest";
import { minimapToWorld } from "./minimap";

describe("minimapToWorld", () => {
  it("maps the corners onto the map bounds", () => {
    expect(minimapToWorld(0, 0, 256, 256, 256)).toEqual({ x: 0, y: 0 });
    expect(minimapToWorld(256, 256, 256, 256, 256)).toEqual({ x: 255, y: 255 });
  });

  it("maps the center to the middle tile", () => {
    expect(minimapToWorld(128, 128, 256, 256, 256)).toEqual({ x: 128, y: 128 });
  });

  it("scales clicks from the CSS size into tile coordinates", () => {
    expect(minimapToWorld(48, 96, 256, 256, 96)).toEqual({ x: 128, y: 255 });
  });
});
