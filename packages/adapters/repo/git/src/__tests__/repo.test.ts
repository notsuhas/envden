import { git as hardenedGit } from "../exec/git.ts";
import { repo, git, roots } from "./fixture.ts";
import { EnvdenError } from "@envden/core/errors";
import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import {
  mkdir,
  rm,
  readFile,
  realpath,
  symlink,
  writeFile,
  chmod,
  link,
  access,
  lstat,
} from "node:fs/promises";
import { basename, join, normalize } from "node:path";
import vectors from "./repo-id-vectors.json";
import { createGitRepoAdapter, normalizeRepoId } from "../index.ts";

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

test("exclude patterns escape git syntax and refuse control characters", async () => {
  const root = await repo();
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  await rejects(adapter.ensureIgnored(checkout, ".env\tlocal"));

  // ".env*" last, so an unescaped glob can't mask an earlier path
  for (const path of [".env.local name", ".env$(id)", ".env?[x]", ".env*"]) {
    await adapter.ensureIgnored(checkout, path);
    expect(await adapter.isIgnored(checkout, path)).toBe(true);
  }

  expect(await adapter.isIgnored(checkout, ".env.l")).toBe(false);
  expect(await adapter.isIgnored(checkout, ".env.other")).toBe(false);
  expect(await readFile(join(root, ".git/info/exclude"), "utf8")).toContain("/.env.local\\ name");
});

test("non-repos and ambiguous remotes", async () => {
  const root = await repo();
  expect(await adapter.checkoutAt(tmpdir())).toBeUndefined();
  git(root, "remote", "rename", "origin", "one");
  git(root, "remote", "add", "two", "https://host/other");
  await rejects(adapter.checkoutAt(root), /Choose/);
});

for (const character of ["%1b", "%E2%80%AE"]) {
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

// git ignores a symlinked .gitignore, so envden ignores through info/exclude and leaves the dotfile alone
test.skipIf(process.platform === "win32")(
  "a .gitignore linked into dotfiles is never written",
  async () => {
    const root = await repo();
    const checkout = (await adapter.checkoutAt(root))!;
    const shared = join(root, "..", `${basename(root)}-gitignore`);
    roots.push(shared);
    await writeFile(shared, "node_modules\n");
    await symlink(shared, join(root, ".gitignore"));

    await adapter.ensureIgnored(checkout, ".env");

    expect(await adapter.isIgnored(checkout, ".env")).toBe(true);
    expect((await lstat(join(root, ".gitignore"))).isSymbolicLink()).toBe(true);
    expect(await readFile(shared, "utf8")).toBe("node_modules\n");
    expect(await readFile(join(root, ".git", "info", "exclude"), "utf8")).toContain("\n/.env\n");
  },
);

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

test("failed ignore attempts do not change exclude bytes", async () => {
  const root = await repo();
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  await writeFile(join(root, ".gitignore"), "!.env.keep\n");
  const exclude = join(checkout.gitDir, "info", "exclude");
  const before = await readFile(exclude);

  await rejects(adapter.ensureIgnored(checkout, ".env.keep"));
  expect(await readFile(exclude)).toEqual(before);
});

test("embedded bare repositories cannot choose checkout identity", async () => {
  const root = await repo();
  const bare = join(root, "embedded");
  git(root, "init", "--bare", bare);
  git(bare, "config", "core.worktree", root);
  git(bare, "config", "core.bare", "false");
  git(bare, "remote", "add", "origin", "https://evil.test/owned");
  expect(await adapter.checkoutAt(bare)).toBeUndefined();
});

test("checkout lookup propagates filesystem failures", async () => {
  const root = await repo();
  await rejects(adapter.checkoutAt(join(root, "missing")));
});
