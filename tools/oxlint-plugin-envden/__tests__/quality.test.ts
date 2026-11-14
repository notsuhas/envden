import { expect, test } from "bun:test";
import { runFixture } from "./utils.ts";

test("rejects ambient time, focused tests, unexplained skips, suppressions, production fakes and hex colours", () => {
  const result = runFixture("quality-policy", {
    "packages/core/src/time.ts": "Date.now(); new Date(); new Date(0);",
    "apps/cli/src/commands/clock.ts": "Date.now();",
    "apps/web/src/colour.ts": 'const colour = "#ffffff";',
    "apps/server/src/fake.ts": 'import { fake } from "@envden/testing";',
    "packages/core/src/__tests__/time.test.ts":
      'test.only("a", () => {});\ntest.skip("b", () => {});\n// https://github.com/a/b/issues/1\ntest.skip("c", () => {});\n// @ts-expect-error\nconst x = 1;',
  });

  expect(result.diagnostics).toHaveLength(7);
});
