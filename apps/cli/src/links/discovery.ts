import { EnvdenError } from "@envden/core/errors";
import type { Dirent } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { basename, resolve, join } from "node:path";
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
  const excludes = await Promise.all(excluded.map(realOrResolved));

  // folders may link elsewhere (~/Work on another volume); walk real paths so each is seen once
  async function walk(path: string, root = false): Promise<void> {
    const real = await realpath(path).catch(() => undefined);
    if (!real || !unseen(real, root, visited, excludes)) return;
    visited.add(real);
    const entries = await readdir(real, { withFileTypes: true }).catch(() => undefined);
    if (!entries) return;

    if (entries.some((entry) => entry.name === ".git"))
      await collectCheckout(repo, real, found, report);

    for (const entry of entries) if (canDescend(entry)) await walk(join(real, entry.name));
  }

  for (const root of roots) await walk(resolve(root), true);

  return [...found.values()];
}

function unseen(real: string, root: boolean, visited: Set<string>, excludes: string[]) {
  if (visited.has(real) || excludes.some((path) => placeInRoot(path, real) !== "outside"))
    return false;

  return root || !skipped.has(basename(real));
}

function realOrResolved(path: string) {
  return realpath(path).catch(() => resolve(path));
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
  return (entry.isDirectory() || entry.isSymbolicLink()) && !skipped.has(entry.name);
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
