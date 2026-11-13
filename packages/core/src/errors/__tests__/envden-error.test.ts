import { expect, test } from "bun:test";

import { EnvdenError, isEnvdenError } from "../index.ts";

test("carries a code and keeps the cause", () => {
  const cause = new Error("disk");
  const error = new EnvdenError("INTERNAL", "Storage failed", { cause });

  expect(error.code).toBe("INTERNAL");
  expect(error.cause).toBe(cause);
  expect(isEnvdenError(error)).toBe(true);
  expect(isEnvdenError(cause)).toBe(false);
});
