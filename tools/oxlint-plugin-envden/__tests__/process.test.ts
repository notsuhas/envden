import { expect, test } from "bun:test";
import { runFixture } from "./utils.ts";

test("direct subprocess APIs are rejected", () => {
  expect(
    runFixture("trusted-process", {
      "apps/cli/src/unsafe.ts":
        'import { execFile } from "node:child_process";\nBun.spawn(["git"]);\nBun.$`git status`;\nimport("child_process");\n',
    }).diagnostics,
  ).toHaveLength(4);
});

test("only the core process module and its tests may spawn directly", () => {
  expect(
    runFixture("trusted-process", {
      "apps/cli/src/__tests__/unsafe.test.ts": 'Bun.spawn(["git"]);',
      "packages/core/src/process/spawn.ts": 'Bun.spawn(["git"]);',
      "packages/core/src/process/__tests__/spawn.test.ts": 'Bun.spawn(["git"]);',
    }).diagnostics,
  ).toHaveLength(1);
});
