import { describe, expect, test } from "bun:test";
import { SKIP, clampRegion, stack } from "../scene.ts";

describe("stack", () => {
  test("takes the first layer that covers a pixel", () => {
    const shader = stack([(x) => (x === 0 ? -1 : SKIP), () => 0.5]);

    expect(shader(0, 0)).toBe(-1);
    expect(shader(1, 0)).toBe(0.5);
  });

  test("is empty where no layer covers", () => {
    expect(stack([() => SKIP])(3, 3)).toBe(0);
  });
});

describe("clampRegion", () => {
  const frame = { width: 100, height: 50, seconds: 0 };

  test("keeps a region inside the canvas", () => {
    expect(clampRegion({ x: -4.5, y: 40.2, width: 20, height: 30 }, frame)).toEqual({
      x: 0,
      y: 40,
      width: 16,
      height: 10,
    });
  });

  test("collapses a region that is fully outside", () => {
    expect(clampRegion({ x: 120, y: 0, width: 10, height: 10 }, frame).width).toBe(0);
  });
});
