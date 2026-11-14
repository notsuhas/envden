import { test, expect } from "bun:test";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { repo, git } from "./fixture.ts";
import { createGitRepoAdapter } from "../index.ts";

const adapter = createGitRepoAdapter({ resolveSshHost: async () => "GitHub.com" });

test("discovery skips submodules and unrelated or dangling symlinks", async () => {
  const root = await repo();
  const checkout = (await adapter.checkoutAt(root))!;
  await writeFile(join(root, ".gitignore"), ".env*\n");
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", ".env"), "KEY=child\n");

  git(
    root,
    "update-index",
    "--add",
    "--cacheinfo",
    "160000,1111111111111111111111111111111111111111,nested",
  );

  if (process.platform !== "win32") {
    await symlink(join(root, "missing"), join(root, ".env.dangling"));
    await symlink(join(root, "nested", ".env"), join(root, ".env.shared"));
  }

  expect(await adapter.envFiles(checkout)).toEqual([]);
});

test("custom env patterns cannot allow shell hooks or skipped folders", async () => {
  const { acceptsEnvPath } = await import("@envden/core/adapters");

  for (const path of [
    ".envrc",
    ".ENVRC",
    "node_modules/.env",
    "Node_Modules/.env",
    "generated/.env",
  ])
    expect(acceptsEnvPath(path, { include: ["*"], extraSkipped: ["generated"] })).toBe(false);

  expect(acceptsEnvPath("apps/.env.local")).toBe(true);
});
