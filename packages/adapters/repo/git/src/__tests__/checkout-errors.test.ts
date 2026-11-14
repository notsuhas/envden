import { expect, spyOn, test } from "bun:test";
import * as processTools from "@envden/core/process";
import { EnvdenError } from "@envden/core/errors";
import { checkoutAt } from "../checkout/checkout.ts";
import { repo } from "./fixture.ts";

test("checkout lookup preserves trusted executable failures", async () => {
  const root = await repo();
  const failure = new EnvdenError("INVALID_INPUT", "Trusted executable unavailable");
  const exec = spyOn(processTools, "execTrusted").mockRejectedValue(failure);

  try {
    await Promise.resolve(expect(checkoutAt(root, async (host) => host)).rejects.toBe(failure));
  } finally {
    exec.mockRestore();
  }
});
