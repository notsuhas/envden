import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const adapters = fileURLToPath(new URL("../../adapters/", import.meta.url));

for (const kind of readdirSync(adapters, { withFileTypes: true }).filter((entry) =>
  entry.isDirectory(),
)) {
  for (const implementation of readdirSync(join(adapters, kind.name), {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory())) {
    const root = join(adapters, kind.name, implementation.name);
    if (!existsSync(join(root, "package.json"))) continue;
    test(`${kind.name}/${implementation.name} has a contract suite`, () => {
      expect(existsSync(join(root, "src/__tests__/contract.test.ts"))).toBe(true);
    });
  }
}
