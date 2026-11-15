import { test, expect } from "bun:test";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { repo, git, roots } from "./fixture.ts";
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
    await symlink(join("nested", ".env"), join(root, ".env.shared"));
  }

  const warnings: string[] = [];
  const original = console.error;
  console.error = (line: string) => warnings.push(line);

  try {
    expect(await adapter.envFiles(checkout)).toEqual([]);
  } finally {
    console.error = original;
  }

  if (process.platform !== "win32")
    expect(warnings).toContain(
      `envden: skipped ${JSON.stringify(join(checkout.root, ".env.shared"))}: it links to "nested/.env", and envden only syncs files it owns`,
    );
});

// ENVDEN_HOME -> dotfiles: the checkout link text goes through the symlinked home
test.skipIf(process.platform === "win32")(
  "discovery keeps a store link made through a linked envden home",
  async () => {
    const root = await repo();
    const store = join(root, "..", `${basename(root)}-store`);
    await mkdir(store);
    roots.push(store);
    await writeFile(join(store, ".env"), "A=1\n");
    await symlink(store, `${store}-link`);
    roots.push(`${store}-link`);
    await writeFile(join(root, ".gitignore"), ".env*\n");
    await symlink(join(`${store}-link`, ".env"), join(root, ".env"));
    const linked = createGitRepoAdapter({ storeRoot: store, resolveSshHost: async () => "h" });
    const checkout = (await linked.checkoutAt(root))!;

    expect(await linked.envFiles(checkout)).toEqual([".env"]);
  },
);

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
