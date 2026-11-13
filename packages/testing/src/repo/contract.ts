import { rejects } from "node:assert/strict";
import { describe, expect, test } from "bun:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IRepoAdapter } from "@envden/core/adapters";
import { withDirectory } from "../fixtures/directory.ts";

interface IRepoFixture {
  repo: IRepoAdapter;
  root: string;
  outside: string;
}

export function repoContract(name: string, factory: (root: string) => Promise<IRepoFixture>): void {
  describe(name, () => {
    test("finds the checkout from nested paths and lists it among worktrees", () =>
      withDirectory(async (directory) => {
        const { repo, root, outside } = await factory(directory);
        await mkdir(join(root, "nested"));
        const checkout = await repo.checkoutAt(root);
        if (!checkout) throw new Error("Expected checkout");
        expect(await repo.checkoutAt(join(root, "nested"))).toEqual(checkout);
        expect(await repo.checkoutAt(outside)).toBeUndefined();
        expect(await repo.worktrees(checkout)).toContain(await realpath(root));
      }));

    test("ignores exact env paths idempotently and discovers only eligible files", () =>
      withDirectory(async (directory) => {
        const { repo, root } = await factory(directory);
        const checkout = await repo.checkoutAt(root);
        if (!checkout) throw new Error("Expected checkout");

        for (const path of [".env", ".env.local", ".env.example", ".envrc", ".env.visible"]) {
          await writeFile(join(root, path), "A=1\n");
        }

        expect(await repo.isIgnored(checkout, ".env")).toBe(false);

        for (const path of [".env", ".env.local", ".env.example", ".envrc"]) {
          await repo.ensureIgnored(checkout, path);
          await repo.ensureIgnored(checkout, path);
          expect(await repo.isIgnored(checkout, path)).toBe(true);
        }

        expect((await repo.envFiles(checkout)).sort()).toEqual([".env", ".env.local"]);
        expect(await repo.isIgnored(checkout, ".env.visible")).toBe(false);
        await rejects(repo.ensureIgnored(checkout, "../outside"));
      }));
  });
}
