import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { repoContract } from "@envden/testing/repo";
import { createGitRepoAdapter } from "../index.ts";

repoContract("Git", async (directory) => {
  const root = join(directory, "repo");
  await mkdir(root);
  execFileSync("git", ["-C", root, "init", "-q"]);

  execFileSync("git", [
    "-C",
    root,
    "remote",
    "add",
    "origin",
    "https://example.test/team/repo.git",
  ]);

  return { repo: createGitRepoAdapter(), root, outside: directory };
});
