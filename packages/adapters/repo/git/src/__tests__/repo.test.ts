import { rejects } from "node:assert/strict";
import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vectors from "./repo-id-vectors.json";
import { createGitRepoAdapter, normalizeRepoId } from "../index.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function repo() {
  const root = await mkdtemp(join(tmpdir(), "envden-git-"));
  roots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.test");
  git(root, "config", "user.name", "test");
  git(root, "remote", "add", "origin", "git@work:Team/Repo.git");

  return root;
}

const adapter = createGitRepoAdapter({ resolveSshHost: async () => "GitHub.com" });

for (const vector of vectors)
  test(`normalize ${vector.remote}`, () =>
    expect(normalizeRepoId(vector.remote, vector.hostname)).toBe(vector.expected));

for (const remote of [
  "/tmp/repo",
  "https://host/../",
  "git@host:../repo",
  "https://host/a/%2e%2e/b.git",
  "file:///tmp/repo",
])
  test(`reject remote ${remote}`, () => {
    expect(() => normalizeRepoId(remote)).toThrow();
  });

test("checkout, only remote fallback, alias resolution and shared worktrees", async () => {
  const root = await repo();
  git(root, "remote", "rename", "origin", "sole");
  await writeFile(join(root, "README"), "test");
  git(root, "add", "README");
  git(root, "commit", "-qm", "initial");
  const other = join(root, "other");
  git(root, "worktree", "add", "-qb", "other", other);
  const checkout = await adapter.checkoutAt(root);
  const worktree = await adapter.checkoutAt(other);
  expect(checkout?.repoId).toBe("github.com/team/repo");
  expect(worktree?.gitDir).toBe(checkout?.gitDir);
  expect(checkout && (await adapter.worktrees(checkout))).toContain(await realpath(other));
  if (!worktree) throw new Error("No worktree");
  await adapter.ensureIgnored(worktree, ".env.local");
  expect(await adapter.isIgnored(worktree, ".env.local")).toBe(true);
});

test("discovery filters templates, envrc, outputs, unignored and tracked files", async () => {
  const root = await repo();
  await mkdir(join(root, "apps"));
  await mkdir(join(root, "dist"));

  const paths = [
    ".env",
    ".env.local",
    ".env.example",
    ".envrc",
    ".env.production.defaults",
    "apps/.env",
    "dist/.env",
    ".env.tracked",
    ".env.visible",
  ];

  for (const path of paths) await writeFile(join(root, path), "A=1\n");
  git(root, "add", ".env.tracked");
  await writeFile(join(root, ".gitignore"), ".env*\n!.env.visible\n");
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  expect(await adapter.envFiles(checkout)).toEqual([".env", ".env.local", "apps/.env"]);
  expect(await adapter.isIgnored(checkout, ".env.tracked")).toBe(false);
  await rejects(adapter.ensureIgnored(checkout, ".env.tracked"), /tracked/);
});

test("exclude patterns escape metacharacters and reject traversal", async () => {
  const root = await repo();
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  await adapter.ensureIgnored(checkout, ".env.[local]");
  expect(await adapter.isIgnored(checkout, ".env.[local]")).toBe(true);
  expect(await adapter.isIgnored(checkout, ".env.l")).toBe(false);
  await rejects(adapter.ensureIgnored(checkout, "../secret"));
  expect(await readFile(join(root, ".git/info/exclude"), "utf8")).toContain("/.env.\\[local\\]");
});

test("non-repos and ambiguous remotes", async () => {
  const root = await repo();
  expect(await adapter.checkoutAt(tmpdir())).toBeUndefined();
  git(root, "remote", "rename", "origin", "one");
  git(root, "remote", "add", "two", "https://host/other");
  await rejects(adapter.checkoutAt(root), /Choose/);
});
