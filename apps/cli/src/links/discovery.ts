import { EnvdenError } from "@envden/core/errors";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { placeInRoot } from "@envden/core/paths";
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
  report: (path: string, reason: string) => void = () => {},
): Promise<ICheckout[]> {
  const found = new Map<string, ICheckout>();
  const visited = new Set<string>();
  const excludes = excluded.map((path) => resolve(path));

  async function walk(path: string): Promise<void> {
    if (visited.has(path) || excludes.some((root) => placeInRoot(root, path) !== "outside")) return;

    visited.add(path);
    let entries;

    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.name === ".git")) {
      await collectCheckout(repo, path, found, report);
    }

    for (const entry of entries) if (canDescend(entry)) await walk(join(path, entry.name));
  }

  for (const root of roots) await walk(resolve(root));

  return [...found.values()];
}

async function collectCheckout(
  repo: IRepoAdapter,
  path: string,
  found: Map<string, ICheckout>,
  report: (path: string, reason: string) => void,
) {
  const checkout = await identify(repo, path, report);

  if (checkout) {
    found.set(checkout.root, checkout);

    for (const worktree of await repo.worktrees(checkout)) {
      const next = await identify(repo, worktree, report);
      if (next) found.set(next.root, next);
    }
  }
}

function canDescend(entry: Dirent) {
  return entry.isDirectory() && !entry.isSymbolicLink() && !skipped.has(entry.name);
}

async function identify(
  repo: IRepoAdapter,
  path: string,
  report: (path: string, reason: string) => void,
) {
  try {
    const checkout = await repo.checkoutAt(path);
    if (!checkout) report(path, "Repository identity unavailable");

    return checkout;
  } catch (error) {
    report(path, error instanceof EnvdenError ? error.message : "Repository identity unavailable");

    return undefined;
  }
}
