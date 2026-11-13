import { describe, expect, test } from "bun:test";
import { bayerThreshold } from "../bayer.ts";

describe("bayerThreshold", () => {
  test("covers sixteen distinct levels inside the unit interval", () => {
    const levels = new Set<number>();

    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) levels.add(bayerThreshold(x, y));
    }

    expect(levels.size).toBe(16);
    expect(Math.min(...levels)).toBeGreaterThan(0);
    expect(Math.max(...levels)).toBeLessThan(1);
  });

  test("repeats every four pixels", () => {
    expect(bayerThreshold(5, 6)).toBe(bayerThreshold(1, 2));
  });
});
