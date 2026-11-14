import { test, expect } from "bun:test";
import { spawnTrusted } from "@envden/core/process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

test("isolated git config directory is removed on process exit", async () => {
  const module = resolve(import.meta.dir, "../exec/config.ts");

  const child = spawnTrusted([
    process.execPath,
    "-e",
    `import { emptyGlobalConfig } from ${JSON.stringify(module)}; console.log(await emptyGlobalConfig());`,
  ]);

  const path = (await new Response(child.stdout).text()).trim();
  expect(await child.exited).toBe(0);
  expect(path).not.toBe("");
  expect(existsSync(dirname(path))).toBe(false);
});
