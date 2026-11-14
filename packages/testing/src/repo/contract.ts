import { rejects } from "node:assert/strict";
import { describe, expect, test } from "bun:test";
import { mkdir, realpath, writeFile, chmod, lstat } from "node:fs/promises";
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
        const checkout = await requireCheckout(repo, root);
        expect(await repo.checkoutAt(join(root, "nested"))).toEqual(checkout);
        expect(await repo.checkoutAt(outside)).toBeUndefined();
        expect(await repo.worktrees(checkout)).toContain(await realpath(root));
      }));

    test("discovery skips unencodable and unreadable directories", () =>
      withDirectory(async (directory) => {
        const { repo, root } = await factory(directory);
        const checkout = await requireCheckout(repo, root);
        await writeFile(join(root, ".gitignore"), ".env\n");
        await writeFile(join(root, ".env"), "A=1");
        const names = process.platform === "win32" ? [] : ["aux", "a:b", "trail "];

        for (const name of [...names, "unreadable"]) {
          await mkdir(join(root, name));
          await writeFile(join(root, name, ".env"), "A=1");
        }

        const blocked = join(root, "unreadable");

        try {
          if (process.platform !== "win32") await chmod(blocked, 0);
          const files = await repo.envFiles(checkout);
          expect(files).toContain(".env");
          for (const name of names) expect(files).not.toContain(`${name}/.env`);

          if (process.platform !== "win32" && process.getuid?.() !== 0)
            expect(files).not.toContain("unreadable/.env");
        } finally {
          await chmod(blocked, 0o700);
        }
      }));

    test("already ignored paths accept special characters and case detection matches the filesystem", () =>
      withDirectory(async (directory) => {
        const { repo, root } = await factory(directory);
        const checkout = await requireCheckout(repo, root);
        await mkdir(join(root, "(auth)"));
        await writeFile(join(root, ".gitignore"), ".env\n");
        await writeFile(join(root, "(auth)", ".env"), "A=1");
        await repo.ensureIgnored(checkout, "(auth)/.env");
        expect(await repo.envFiles(checkout)).toEqual(["(auth)/.env"]);
        await writeFile(join(root, "CaseProbe"), "");
        const original = await lstat(join(root, "CaseProbe"));
        const alternate = await lstat(join(root, "CASEPROBE")).catch(() => undefined);

        expect(await repo.caseInsensitive(root)).toBe(
          alternate?.ino === original.ino && alternate?.dev === original.dev,
        );
      }));

    test("env file rules configure include, exclude and skipped directories", () =>
      withDirectory(async (directory) => {
        const { repo, root } = await factory(directory);
        const checkout = await requireCheckout(repo, root);
        await mkdir(join(root, "generated"));

        for (const path of [".env", ".env.local", "secrets.conf", ".envrc", "generated/.env"]) {
          await writeFile(join(root, path), "A=1\n");
          await repo.ensureIgnored(checkout, path);
        }

        expect(await repo.envFiles(checkout, { include: ["secrets.*", ".envrc"] })).toEqual([
          "secrets.conf",
        ]);

        expect(await repo.envFiles(checkout, { exclude: ["*.local"] })).toEqual([
          ".env",
          "generated/.env",
        ]);

        expect(await repo.envFiles(checkout, { extraSkipped: ["generated"] })).toEqual([
          ".env",
          ".env.local",
        ]);
      }));

    test("ignores exact env paths idempotently and discovers only eligible files", () =>
      withDirectory(async (directory) => {
        const { repo, root } = await factory(directory);
        const checkout = await requireCheckout(repo, root);

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

async function requireCheckout(repo: IRepoAdapter, root: string) {
  const checkout = await repo.checkoutAt(root);
  if (!checkout) throw new Error("Expected checkout");

  return checkout;
}
