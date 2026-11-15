import { afterEach } from "bun:test";
import { execTrustedSync as execFileSync } from "@envden/core/process";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const roots: string[] = [];

const config = `[user]
\temail = test@example.test
\tname = test
[remote "origin"]
\turl = git@work:Team/Repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`;

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
  // one spawn instead of three config calls
  await appendFile(join(root, ".git", "config"), config);

  return root;
}
