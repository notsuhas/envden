import { afterEach } from "bun:test";
import { execTrustedSync as execFileSync } from "@envden/core/process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

export function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, ...args]).trim();
}

export async function repo() {
  const root = await mkdtemp(join(tmpdir(), "envden-git-"));
  roots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.test");
  git(root, "config", "user.name", "test");
  git(root, "remote", "add", "origin", "git@work:Team/Repo.git");

  return root;
}
