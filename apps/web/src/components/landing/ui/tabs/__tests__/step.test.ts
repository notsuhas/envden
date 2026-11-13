import { describe, expect, test } from "bun:test";
import { stepTab } from "../step.ts";

describe("stepTab", () => {
  test("arrows move one tab and wrap at both ends", () => {
    expect(stepTab(0, "ArrowRight", 6)).toBe(1);
    expect(stepTab(5, "ArrowDown", 6)).toBe(0);
    expect(stepTab(0, "ArrowLeft", 6)).toBe(5);
    expect(stepTab(3, "ArrowUp", 6)).toBe(2);
  });

  test("Home and End jump to the ends", () => {
    expect(stepTab(3, "Home", 6)).toBe(0);
    expect(stepTab(3, "End", 6)).toBe(5);
  });

  test("other keys stay put", () => {
    expect(stepTab(2, "a", 6)).toBe(2);
  });
});
