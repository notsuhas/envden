import { describe, expect, test } from "bun:test";
import { cipherLine } from "../cipher.ts";

describe("cipherLine", () => {
  test("has the requested length", () => {
    expect(cipherLine(30, 1)).toHaveLength(30);
    expect(cipherLine(0, 1)).toBe("");
  });

  test("is stable for a seed and differs across seeds", () => {
    expect(cipherLine(30, 7)).toBe(cipherLine(30, 7));
    expect(cipherLine(30, 7)).not.toBe(cipherLine(30, 8));
  });

  test("uses only base64 characters", () => {
    expect(cipherLine(200, 42)).toMatch(/^[A-Za-z0-9+/]+$/);
  });
});
