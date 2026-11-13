import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateAdapter } from "../generate.ts";

const templates = resolve(import.meta.dir, "../../../packaging/templates/adapter");

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "envden-new-adapter-"));

  try {
    for (const kind of ["network", "repo"]) {
      await mkdir(join(root, "packages/core/src/adapters"), { recursive: true });
      await mkdir(join(root, "packages/testing/src", kind), { recursive: true });
      await writeFile(join(root, "packages/core/src/adapters", `${kind}.ts`), "");
      await writeFile(join(root, "packages/testing/src", kind, "contract.ts"), "");
    }

    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function read(target: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const file of (await readdir(target, { recursive: true })).sort()) {
    if (/\.(?:ts|json)$/u.test(file))
      files[file.replaceAll("\\", "/")] = await readFile(join(target, file), "utf8");
  }

  return files;
}

test("fills every name and leaves no template token behind", () =>
  withRoot(async (root) => {
    const target = await generateAdapter(root, templates, "network", "zero-tier");
    const files = await read(target);

    expect(target).toBe(join(root, "packages/adapters/network/zero-tier"));

    expect(Object.keys(files)).toEqual([
      "package.json",
      "src/__tests__/contract.test.ts",
      "src/adapter.ts",
      "src/index.ts",
      "tsconfig.json",
    ]);

    expect(files["package.json"]).toContain('"name": "@envden/adapter-network-zero-tier"');
    expect(files["src/adapter.ts"]).toContain("createZeroTierNetworkAdapter(): INetworkAdapter");
    expect(files["src/__tests__/contract.test.ts"]).toContain('networkContract("ZeroTier"');
    expect(Object.values(files).join("")).not.toMatch(/\{\{|\.tmpl/u);
  }));

test("a kind's own templates replace the base ones", () =>
  withRoot(async (root) => {
    const files = await read(await generateAdapter(root, templates, "repo", "jj"));

    expect(files["src/__tests__/contract.test.ts"]).toContain("outside: directory");
    expect(files["src/adapter.ts"]).toContain("createJjRepoAdapter(): IRepoAdapter");
  }));

test("refuses unknown kinds, unsafe names and existing packages", () =>
  withRoot(async (root) => {
    await rejects(generateAdapter(root, templates, "cache", "redis"), /contract suite/u);
    await rejects(generateAdapter(root, templates, "network", "../escape"), /kebab-case/u);
    await rejects(generateAdapter(root, templates, "Network", "lan"), /lowercase/u);
    await generateAdapter(root, templates, "network", "lan");
    await rejects(generateAdapter(root, templates, "network", "lan"), /already exists/u);
  }));
