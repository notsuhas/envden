import { expect, test } from "bun:test";
import { EnvdenError } from "@envden/core/errors";
import { errorBody, errorStatus } from "../errors.ts";

test.each([
  ["INVALID_INPUT", 400],
  ["LOCKED", 403],
  ["NOT_FOUND", 404],
  ["CONFLICT", 409],
  ["HEAD_MOVED", 409],
  ["CLIENT_TOO_OLD", 426],
  ["INTERNAL", 500],
  ["SERVER_UNREACHABLE", 502],
] as const)("%s maps to %d", (code, status) => {
  expect(errorStatus(code)).toBe(status);
});

test("only envden errors keep their message", () => {
  expect(errorBody(new EnvdenError("LOCKED", "Vault keys unavailable"))).toEqual({
    error: "LOCKED",
    message: "Vault keys unavailable",
  });

  expect(errorBody(new Error("ENOENT /home/me/.envden/store/secret"))).toEqual({
    error: "INTERNAL",
    message: "envden ui hit an internal error",
  });
});
