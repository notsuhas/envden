import { rejects } from "node:assert/strict";
import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IPlacementAdapter } from "@envden/core/adapters";
import { withDirectory } from "../fixtures/directory.ts";

export function placementContract(
  name: string,
  factory: (root: string) => IPlacementAdapter,
): void {
  describe(name, () => {
    test("placement can be inspected, repeated and removed", () =>
      withDirectory(async (root) => {
        const adapter = factory(root);
        const store = join(root, "store");
        const checkout = join(root, "nested", ".env");
        await writeFile(store, "A=1\n");

        if (!(await adapter.supported(root))) {
          await rejects(adapter.place(store, checkout));

          return;
        }

        expect(await adapter.inspect(store, checkout)).toBe("missing");
        await adapter.place(store, checkout);
        expect(await readFile(checkout, "utf8")).toBe("A=1\n");
        expect(await adapter.inspect(store, checkout)).toBe("linked");
        await adapter.place(store, checkout);
        expect(await adapter.inspect(store, checkout)).toBe("linked");
        await adapter.remove(store, checkout);
        await adapter.remove(store, checkout);
        expect(await adapter.inspect(store, checkout)).toBe("missing");
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
        await rejects(adapter.place(store, join(root, "outside")));
        await rejects(adapter.inspect(store, join(root, "outside")));
        await rejects(adapter.remove(store, join(root, "outside")));
        await mkdir(join(checkout, ".env"));
        await rejects(adapter.place(store, join(checkout, ".env")));
      }));
  });
}
