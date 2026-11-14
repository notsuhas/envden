import { rejects } from "node:assert/strict";
import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile, symlink, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { IPlacementAdapter } from "@envden/core/adapters";
import { withDirectory } from "../fixtures/directory.ts";

export function placementContract(
  name: string,
  factory: (root: string, backupDirectory?: string) => IPlacementAdapter,
): void {
  describe(name, () => {
    test("placement can be inspected, repeated and removed", () =>
      withDirectory(async (root) => {
        const adapter = factory(root);
        const store = join(root, "store");
        const checkout = join(root, "nested", ".env");
        await writeFile(store, "A=1\n");

        if (!(await adapter.supported(root))) {
          await rejects(adapter.place(store, checkout, async () => {}));

          return;
        }

        expect(await adapter.inspect(store, checkout)).toBe("missing");
        await adapter.place(store, checkout, async () => {});
        expect(await readFile(checkout, "utf8")).toBe("A=1\n");
        expect(await adapter.inspect(store, checkout)).toBe("linked");
        await adapter.place(store, checkout, async () => {});
        expect(await adapter.inspect(store, checkout)).toBe("linked");
        await adapter.remove(store, checkout);
        await adapter.remove(store, checkout);
        expect(await adapter.inspect(store, checkout)).toBe("missing");
      }));

    test("refuses unrelated links and linked parents and backs up overwrites", () =>
      withDirectory(async (root) => {
        const checkout = join(root, "checkout");
        const backups = join(root, "backups");
        await mkdir(checkout);
        const adapter = factory(checkout, backups);
        if (!(await adapter.supported(checkout))) return;
        const store = join(root, "store");
        const unrelated = join(root, "unrelated");
        const destination = join(checkout, ".env");
        await writeFile(store, "NEW=1");
        await writeFile(unrelated, "KEEP=1");

        let linked = true;

        try {
          await symlink(unrelated, destination);
        } catch (error) {
          if (
            !(
              error instanceof Error &&
              "code" in error &&
              process.platform === "win32" &&
              error.code === "EPERM"
            )
          )
            throw error;

          linked = false;
        }

        if (linked) {
          await rejects(adapter.place(store, destination, async () => {}));
          expect(await readFile(unrelated, "utf8")).toBe("KEEP=1");
          await rm(destination);
        }

        await symlink(
          root,
          join(checkout, "parent"),
          process.platform === "win32" ? "junction" : "dir",
        );

        await rejects(adapter.place(store, join(checkout, "parent", ".env"), async () => {}));
        await writeFile(destination, "OLD=1");
        await adapter.place(store, destination, async () => {});
        const names = await readdir(backups);
        expect(names).toHaveLength(1);
        expect(await readFile(join(backups, names[0]!), "utf8")).toBe("OLD=1");
      }));

    test("inspection distinguishes equal copies and changed files", () =>
      withDirectory(async (root) => {
        const adapter = factory(root);
        const store = join(root, "store");
        const checkout = join(root, ".env");
        await writeFile(store, "A=1\n");
        await writeFile(checkout, "A=1\n");

        expect(await adapter.inspect(store, checkout)).toBe(
          adapter.mode === "link" ? "relinkable" : "linked",
        );

        await writeFile(checkout, "A=2\n");
        expect(await adapter.inspect(store, checkout)).toBe("detached");
      }));

    test("rejects paths outside the checkout and directory destinations", () =>
      withDirectory(async (root) => {
        const checkout = join(root, "checkout");
        await mkdir(checkout);
        const adapter = factory(checkout);
        const store = join(root, "store");
        await writeFile(store, "A=1\n");
        await rejects(adapter.place(store, join(root, "outside"), async () => {}));
        await rejects(adapter.inspect(store, join(root, "outside")));
        await rejects(adapter.remove(store, join(root, "outside")));
        await mkdir(join(checkout, ".env"));
        await rejects(adapter.place(store, join(checkout, ".env"), async () => {}));
      }));
  });
}
