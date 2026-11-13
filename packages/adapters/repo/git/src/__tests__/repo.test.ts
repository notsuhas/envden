import { EnvdenError } from "@envden/core/errors";
import { rejects } from "node:assert/strict";
import { afterEach, expect, test } from "bun:test";
import { execTrustedSync as execFileSync } from "@envden/core/process";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
  chmod,
  link,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { resolveSshHost } from "../repo-id/ssh.ts";
import { git as hardenedGit } from "../exec/git.ts";
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
    expect(() => normalizeRepoId(remote)).toThrow(EnvdenError);
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
  expect(worktree?.registeredWorktree).toBe(true);
  expect(worktree?.gitDir).toBe(checkout?.gitDir);

  expect(checkout && (await adapter.worktrees(checkout))).toContain(
    normalize(await realpath(other)),
  );

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

test("exclude patterns escape literal spaces and reject traversal", async () => {
  const root = await repo();
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  await adapter.ensureIgnored(checkout, ".env.local name");
  expect(await adapter.isIgnored(checkout, ".env.local name")).toBe(true);
  expect(await adapter.isIgnored(checkout, ".env.l")).toBe(false);
  await rejects(adapter.ensureIgnored(checkout, "../secret"));
  expect(await readFile(join(root, ".git/info/exclude"), "utf8")).toContain("/.env.local\\ name");
});

test("non-repos and ambiguous remotes", async () => {
  const root = await repo();
  expect(await adapter.checkoutAt(tmpdir())).toBeUndefined();
  git(root, "remote", "rename", "origin", "one");
  git(root, "remote", "add", "two", "https://host/other");
  await rejects(adapter.checkoutAt(root), /Choose/);
});

for (const character of ["%1b", "%09", "%E2%80%AE", "%E2%80%8B", "%7F"]) {
  test(`reject decoded terminal control ${character}`, () => {
    expect(() => normalizeRepoId(`https://host/team/${character}repo`)).toThrow();
    expect(() => normalizeRepoId(`git@host:team/${character}repo`)).toThrow();
  });
}

test("a forged git file is not a registered worktree", async () => {
  const root = await repo();
  const forged = join(root, "forged");
  await mkdir(forged);
  await writeFile(join(forged, ".git"), `gitdir: ${join(root, ".git")}\n`);
  expect((await adapter.checkoutAt(forged))?.registeredWorktree).toBe(false);
});

test.skipIf(process.platform === "win32")("exclude refuses symlink files and parents", async () => {
  const root = await repo();
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  const target = join(root, "rc");
  await writeFile(target, "keep");
  await rm(join(root, ".git", "info", "exclude"));
  await symlink(target, join(root, ".git", "info", "exclude"));
  await rejects(adapter.ensureIgnored(checkout, ".env"));
  expect(await readFile(target, "utf8")).toBe("keep");
  await rm(join(root, ".git", "info"), { recursive: true });
  await symlink(root, join(root, ".git", "info"));
  await rejects(adapter.ensureIgnored(checkout, ".env"));
  expect(await readFile(target, "utf8")).toBe("keep");
});

for (const path of [
  ".env;echo",
  ".env$(id)",
  ".env\tlocal",
  ".env`id`",
  ".env*",
  ".env?[x]",
  ".env#x",
  ".env!x",
]) {
  test(`exclude rejects unsafe pattern ${JSON.stringify(path)}`, async () => {
    const root = await repo();
    const checkout = await adapter.checkoutAt(root);
    if (!checkout) throw new Error("No checkout");
    await rejects(adapter.ensureIgnored(checkout, path));
  });
}

test("filesystem failures are typed and do not expose command output", async () => {
  const root = await repo();
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  await rm(join(root, ".git"), { recursive: true });
  await rejects(adapter.ensureIgnored(checkout, ".env"), EnvdenError);
});

test("checkout exposes normalized upstream identity alongside the fork", async () => {
  const root = await repo();
  git(root, "remote", "add", "upstream", "https://GitHub.com/Upstream/Project.git");
  const checkout = await adapter.checkoutAt(root);
  expect(checkout?.repoId).toBe("github.com/team/repo");
  expect(checkout?.upstreamRepoId).toBe("github.com/upstream/project");
});

test("git disables executable repository configuration for every read command", async () => {
  const root = await repo();
  const marker = join(root, "executed");
  const script = join(root, "monitor");
  await writeFile(script, `#!/bin/sh\ntouch '${marker}'\n`);
  await chmod(script, 0o700);
  git(root, "config", "core.fsmonitor", script);
  await writeFile(join(root, ".env"), "secret");
  await writeFile(join(root, ".gitignore"), ".env\n");

  for (const args of [
    ["ls-files", "-z", "--", ".env"],
    ["check-ignore", "--", ".env"],
    ["rev-parse", "--show-toplevel"],
    ["worktree", "list", "--porcelain", "-z"],
    ["remote", "get-url", "origin"],
    ["config", "--get", "core.fsmonitor"],
  ]) {
    await hardenedGit(root, args);
  }

  await rejects(access(marker));
});

test("exclude refuses hardlinks without modifying their target", async () => {
  const root = await repo();
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  const target = join(root, "protected");
  await writeFile(target, "keep");
  const exclude = join(root, ".git/info/exclude");
  await rm(exclude);
  await link(target, exclude);
  await rejects(adapter.ensureIgnored(checkout, ".env"));
  expect(await readFile(target, "utf8")).toBe("keep");
});

test("SSH rejects option and shell injection before running host resolution", async () => {
  const root = await repo();
  const marker = join(root, "executed");

  for (const host of [
    "-oProxyCommand=touch",
    "-Fconfig",
    `host;touch ${marker}`,
    `host$(touch ${marker})`,
    "host\nother",
    "",
  ])
    await rejects(resolveSshHost(host), /Unsafe SSH host/);

  await rejects(access(marker));
});
