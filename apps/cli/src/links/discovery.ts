import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import type { ICheckout, IRepoAdapter } from "@envden/core/adapters";

const skipped = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
  ".envden",
  ".cache",
  "Library",
  ".Trash",
]);

export async function discoverRepos(
  repo: IRepoAdapter,
  roots: string[],
  excluded: string[],
): Promise<ICheckout[]> {
  const found = new Map<string, ICheckout>();
  const visited = new Set<string>();
  const excludes = excluded.map((path) => resolve(path));

  async function walk(path: string): Promise<void> {
    if (visited.has(path) || excludes.some((root) => isWithinRoot(root, path))) return;

    visited.add(path);
    let entries;

    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.name === ".git")) {
      await collectCheckout(repo, path, found);
    }

    for (const entry of entries) if (canDescend(entry)) await walk(join(path, entry.name));
  }

  for (const root of roots) await walk(resolve(root));

  return [...found.values()];
}

async function collectCheckout(repo: IRepoAdapter, path: string, found: Map<string, ICheckout>) {
  const checkout = await repo.checkoutAt(path);

  if (checkout) {
    found.set(checkout.root, checkout);

    for (const worktree of await repo.worktrees(checkout)) {
      const next = await repo.checkoutAt(worktree);
      if (next) found.set(next.root, next);
    }
  }
}

export function isWithinRoot(root: string, path: string) {
  const rel = relative(root, path);

  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function canDescend(entry: Dirent) {
  return entry.isDirectory() && !entry.isSymbolicLink() && !skipped.has(entry.name);
}
