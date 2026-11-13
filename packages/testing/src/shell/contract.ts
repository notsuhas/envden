import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { IShellAdapter } from "@envden/core/adapters";
import { withDirectory } from "../fixtures/directory.ts";

export function shellContract(name: string, factory: (home: string) => IShellAdapter): void {
  describe(name, () => {
    test("install and uninstall are idempotent and preserve user configuration", () =>
      withDirectory(async (home) => {
        const adapter = factory(home);
        expect(relative(home, adapter.rcPath()).startsWith("..")).toBe(false);
        expect(await adapter.installed()).toBe(false);
        await mkdir(dirname(adapter.rcPath()), { recursive: true });
        const original = "# user configuration\n";
        await writeFile(adapter.rcPath(), original);
        const binary = join(home, "bin", "envden");
        await adapter.install(binary);
        const installed = await readFile(adapter.rcPath(), "utf8");
        expect(installed).toContain(adapter.hookSnippet(binary));
        expect(await adapter.installed()).toBe(true);
        await adapter.install(binary);
        expect(await readFile(adapter.rcPath(), "utf8")).toBe(installed);
        await adapter.uninstall();
        await adapter.uninstall();
        expect(await adapter.installed()).toBe(false);
        expect(await readFile(adapter.rcPath(), "utf8")).toBe(original);
      }));

    test("install creates missing parent directories", () =>
      withDirectory(async (home) => {
        const adapter = factory(home);
        await adapter.uninstall();
        await adapter.install(join(home, "envden"));
        expect(await adapter.installed()).toBe(true);
        await adapter.uninstall();
        expect(await adapter.installed()).toBe(false);
      }));
  });
}
