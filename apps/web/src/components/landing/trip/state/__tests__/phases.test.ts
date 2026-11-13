import { describe, expect, test } from "bun:test";
import { TRIP_PHASES, nextStep, stepDuration } from "../phases.ts";

describe("nextStep", () => {
  test("walks the phases in order and loops after the last", () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(TRIP_PHASES.length - 1)).toBe(0);
  });
});

describe("stepDuration", () => {
  test("holds longest on the final state", () => {
    const durations = TRIP_PHASES.map((_, step) => stepDuration(step, false));

    expect(Math.max(...durations)).toBe(stepDuration(TRIP_PHASES.length - 1, false));
  });

  test("a picked step is held longer than the same step in the loop", () => {
    expect(stepDuration(1, true)).toBeGreaterThan(stepDuration(1, false));
  });
});
