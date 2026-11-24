import { expect, test } from "bun:test";
import { missingSetupFlags } from "../missing-setup-flags.ts";

test("setup lists every unanswered choice without a terminal", () => {
  expect(missingSetupFlags(false, {})).toHaveLength(7);
  expect(missingSetupFlags(false, { yes: true })).toEqual([]);
  expect(missingSetupFlags(true, {})).toEqual([]);

  expect(
    missingSetupFlags(false, {
      server: "https://example.test",
      telemetry: "off",
      updateCheck: "on",
      shell: "none",
      agent: "off",
      scanRoot: ["/tmp"],
      recoveryCodeOut: "/tmp/code.txt",
    }),
  ).toEqual([]);
});
