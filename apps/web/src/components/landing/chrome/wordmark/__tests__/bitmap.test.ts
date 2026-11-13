import { describe, expect, test } from "bun:test";
import { WORDMARK_ROWS, wordmarkBitmap } from "../bitmap.ts";

describe("wordmarkBitmap", () => {
  test("lays six letters out on seven equal rows", () => {
    const rows = wordmarkBitmap("envden");

    expect(rows).toHaveLength(WORDMARK_ROWS);
    expect(new Set(rows.map((row) => row.length))).toEqual(new Set([35]));
  });

  test("gives the d its ascender and leaves the other tops empty", () => {
    const [top] = wordmarkBitmap("envden");

    expect(top).toBe(`${".".repeat(22)}#${".".repeat(12)}`);
  });
});
