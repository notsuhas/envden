import { expect, test } from "bun:test";
import { diagnosticsFor, runFixture } from "./utils.ts";

const directories = ["apps/cli/src", "tools/runner", "scripts"];

const bypasses = [
  'import { spawn as run } from "bun"; run(["git"]);',
  'import * as runtime from "bun"; runtime.spawn(["git"]);',
  'const B = globalThis.Bun; B.spawn(["git"]);',
  "const { spawn } = Bun;",
  'require("child_process");',
  'import("node:child_process");',
  'import { execa } from "execa";',
  'import("zx");',
  'process.binding("spawn_sync");',
  'globalThis.Bun.spawnSync(["git"]);',
  'globalThis.process.binding("spawn_sync");',
  'process.getBuiltinModule("child_process").spawnSync("git");',
  'globalThis.process.getBuiltinModule("node:child_process");',
  'import proc from "node:process"; proc.getBuiltinModule("child_process");',
  'import { getBuiltinModule } from "node:process";',
  'export { spawn } from "node:child_process";',
  'export * from "child_process";',
];

const bypassFiles = Object.fromEntries(
  bypasses.flatMap((source, index) =>
    directories.map((directory) => [`${directory}/bypass${index}.ts`, source]),
  ),
);

const { diagnostics } = runFixture("trusted-process", {
  ...bypassFiles,
  "apps/cli/src/unsafe.ts":
    'import { execFile } from "node:child_process";\nBun.spawn(["git"]);\nBun.$`git status`;\nimport("child_process");\n',
  "apps/cli/src/__tests__/unsafe.test.ts": 'Bun.spawn(["git"]);',
  "packages/core/src/process/spawn.ts": 'Bun.spawn(["git"]);',
  "packages/core/src/process/__tests__/spawn.test.ts": 'Bun.spawn(["git"]);',
  "tools/oxlint-plugin-envden/__tests__/utils.ts": 'require("child_process");',
  "scripts/release/__tests__/sign.test.ts": 'Bun.spawn(["git"]);',
  "scripts/release/__tests__/other.test.ts": 'Bun.spawn(["git"]);',
  "tools/other/__tests__/utils.ts": 'Bun.spawn(["git"]);',
});

function reported(file: string): number {
  return diagnosticsFor(diagnostics, file).length;
}

test("direct subprocess APIs are rejected", () => {
  expect(reported("apps/cli/src/unsafe.ts")).toBe(4);
});

test("only the core process module and its tests may spawn directly", () => {
  expect(reported("apps/cli/src/__tests__/unsafe.test.ts")).toBe(1);
  expect(reported("packages/core/src/process/spawn.ts")).toBe(0);
  expect(reported("packages/core/src/process/__tests__/spawn.test.ts")).toBe(0);
});

for (const [index, source] of bypasses.entries())
  test(`rejects bypass ${source}`, () => {
    for (const directory of directories)
      expect(reported(`${directory}/bypass${index}.ts`)).toBeGreaterThan(0);
  });

test("only named test helpers bypass the boundary", () => {
  expect(reported("tools/oxlint-plugin-envden/__tests__/utils.ts")).toBe(0);
  expect(reported("scripts/release/__tests__/sign.test.ts")).toBe(0);
  expect(reported("scripts/release/__tests__/other.test.ts")).toBe(1);
  expect(reported("tools/other/__tests__/utils.ts")).toBe(1);
});
