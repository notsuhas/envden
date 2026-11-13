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

for (const source of [
  'import { spawn as run } from "bun"; run(["git"]);',
  'import { spawnSync } from "bun";',
  'import { $ } from "bun";',
  'import * as runtime from "bun"; runtime.spawn(["git"]);',
  'import runtime from "bun"; runtime.spawnSync(["git"]);',
  'const runtime = Bun; runtime.spawnSync(["git"]);',
  "const { spawn } = Bun;",
  'require("child_process");',
  'require("node:child_process");',
  'import("node:child_process");',
  'import("child_process");',
  'import { execa } from "execa";',
  'import { $ } from "zx";',
  'require("execa");',
  'import("zx");',
  'process.binding("spawn_sync");',
  'Bun.spawnSync(["git"]);',
  'globalThis.Bun.spawnSync(["git"]);',
  'globalThis.process.binding("spawn_sync");',
  'process.getBuiltinModule("child_process").spawnSync("git");',
  'globalThis.process.getBuiltinModule("node:child_process");',
  'import proc from "node:process"; proc.getBuiltinModule("child_process");',
  'import * as proc from "node:process"; proc.binding("spawn_sync");',
  'import { getBuiltinModule } from "node:process";',
  'export { spawn } from "node:child_process";',
  'export * from "child_process";',
])
  test(`rejects bypass ${source}`, () => {
    for (const directory of ["apps/cli/src", "tools/runner", "scripts"]) {
      expect(
        runFixture("trusted-process", { [`${directory}/unsafe.ts`]: source }).diagnostics.length,
      ).toBeGreaterThan(0);
    }
  });

test("only named test helpers bypass the boundary", () => {
  expect(
    runFixture("trusted-process", {
      "tools/oxlint-plugin-envden/__tests__/utils.ts": 'require("child_process");',
      "scripts/release/__tests__/sign.test.ts": 'Bun.spawn(["git"]);',
      "scripts/release/__tests__/other.test.ts": 'Bun.spawn(["git"]);',
      "tools/other/__tests__/utils.ts": 'Bun.spawn(["git"]);',
    }).diagnostics,
  ).toHaveLength(2);
});
