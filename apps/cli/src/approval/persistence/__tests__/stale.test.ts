import { expect, test } from "bun:test";
import { EnvdenError, type TErrorCode } from "@envden/core/errors";
import { isStaleSwapError } from "../stale.ts";

test.each([
  ["HEAD_MOVED", true],
  ["UNAUTHORIZED", true],
  ["SERVER_UNREACHABLE", false],
] as [TErrorCode, boolean][])("%s marks a saved pairing swap stale: %p", (code, stale) => {
  expect(isStaleSwapError(new EnvdenError(code, "x"))).toBe(stale);
});

test("non-envden errors keep the saved swap", () => {
  expect(isStaleSwapError(new Error("offline"))).toBe(false);
});
