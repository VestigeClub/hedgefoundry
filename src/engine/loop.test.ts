import { describe, expect, it } from "vitest";
import { speedChipLabel } from "./loop";

describe("speedChipLabel", () => {
  it("labels pause and each legal speed", () => {
    expect(speedChipLabel(true, 1)).toBe("PAUSED");
    expect(speedChipLabel(true, 4)).toBe("PAUSED");
    expect(speedChipLabel(false, 1)).toBe("1×");
    expect(speedChipLabel(false, 2)).toBe("2×");
    expect(speedChipLabel(false, 4)).toBe("4×");
  });
});
