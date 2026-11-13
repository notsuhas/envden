import { test, expect } from "bun:test";
import { EnvdenError } from "@envden/core/errors";
import { shellFailure } from "../operation.ts";

test("shell failures preserve domain errors and hide unexpected error text", () => {
  const domain = new EnvdenError("CONFLICT", "Shell changed");
  expect(() => shellFailure(domain)).toThrow(domain);
  const cause = new Error("private shell contents");

  try {
    shellFailure(cause);
  } catch (error) {
    expect(error).toMatchObject({ code: "INTERNAL", cause });
    expect(String(error)).not.toContain(cause.message);
  }
});
