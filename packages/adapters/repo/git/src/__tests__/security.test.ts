import { test, expect } from "bun:test";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { repo, git } from "./fixture.ts";
import { createGitRepoAdapter } from "../index.ts";

const adapter = createGitRepoAdapter({ resolveSshHost: async () => "GitHub.com" });

// a link the user made is listed, so the CLI can name it or offer to take it over
test("discovery skips submodules and nested clones, lists the user's own links and prints nothing", async () => {
  const root = await repo();
  const checkout = (await adapter.checkoutAt(root))!;
  await writeFile(join(root, ".gitignore"), ".env*\n");
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", ".env"), "KEY=child\n");
  await mkdir(join(root, "libs", "clone", ".git"), { recursive: true });
  await writeFile(join(root, "libs", "clone", ".env"), "KEY=vendored\n");

  git(
    root,
    "update-index",
    "--add",
    "--cacheinfo",
    "160000,1111111111111111111111111111111111111111,nested",
  );

  await symlink(join(root, "missing"), join(root, ".env.dangling"));
  await symlink(join("nested", ".env"), join(root, ".env.shared"));

  const warnings: string[] = [];
  const original = console.error;
  console.error = (line: string) => warnings.push(line);

  try {
    expect(await adapter.envFiles(checkout)).toEqual([".env.dangling", ".env.shared"]);
  } finally {
    console.error = original;
  }

  expect(warnings).toEqual([]);
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
