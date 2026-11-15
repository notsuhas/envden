import type { Dirent } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { placeInRoot } from "@envden/core/paths";
import type { ICheckout, IRepoAdapter } from "@envden/core/adapters";
import { projectFolder, skippedFolder, type IFolderPlace } from "./folders.ts";
import pLimit, { type LimitFunction } from "p-limit";
import { identify, type IRepoSkip } from "./identify.ts";

// git calls dominate a scan; a few at a time is fast without flooding the machine with processes
const GIT_CONCURRENCY = 8;
const FS_CONCURRENCY = 32;

interface IDiscoveryScope {
  roots: string[];
  excluded?: string[] | undefined;
  home?: string | undefined;
}

interface IDiscoveryEvents {
  report?: (skip: IRepoSkip) => void;
  progress?: (found: number) => void;
}

interface IWalk {
  repo: IRepoAdapter;
  found: Map<string, ICheckout>;
  visited: Set<string>;
  excludes: string[];
  home: string | undefined;
  events: IDiscoveryEvents;
  git: LimitFunction;
  fs: LimitFunction;
}

export async function discoverRepos(
  repo: IRepoAdapter,
  scope: IDiscoveryScope,
  events: IDiscoveryEvents = {},
): Promise<ICheckout[]> {
  const excludes = await Promise.all((scope.excluded ?? []).map(realOrResolved));
  const home = scope.home === undefined ? undefined : await realOrResolved(scope.home);

  const walk: IWalk = {
    repo,
    found: new Map(),
    visited: new Set(),
    excludes,
    home,
    events,
    git: pLimit(GIT_CONCURRENCY),
    fs: pLimit(FS_CONCURRENCY),
  };

  await Promise.all(scope.roots.map((root) => walkFolder(walk, resolve(root), true)));

  // folders finish in any order, so sort for a stable list
  return [...walk.found.values()].sort((a, b) => a.root.localeCompare(b.root));
}

// folders may link elsewhere (~/Work on another volume); walk real paths so each is seen once
async function walkFolder(walk: IWalk, path: string, root = false): Promise<void> {
  const real = await walk.fs(() => realpath(path).catch(() => undefined));
  if (!real || !unseen(walk, real)) return;
  walk.visited.add(real);

  const entries = await walk.fs(() =>
    readdir(real, { withFileTypes: true }).catch(() => undefined),
  );

  if (!entries) return;

  // clones inside a checkout are vendored code; a scan root and an unidentified git init are walked
  if (entries.some((entry) => entry.name === ".git") && (await collect(walk, real)) && !root)
    return;

  const place = {
    home: real === walk.home,
    project: projectFolder(entries.map((entry) => entry.name)),
  };

  await Promise.all(
    entries
      .filter((entry) => canDescend(entry, place))
      .map((entry) => walkFolder(walk, join(real, entry.name))),
  );
}

async function collect(walk: IWalk, path: string) {
  const checkout = await walk.git(() => identify(walk.repo, path, report(walk)));
  if (!checkout) return false;
  add(walk, checkout);
  await Promise.all([collectWorktrees(walk, checkout), collectSubmodules(walk, checkout)]);

  return true;
}

// registered worktrees count even under hidden folders (~/.t3/worktrees), which the walk never enters
async function collectWorktrees(walk: IWalk, checkout: ICheckout) {
  const worktrees = await walk.git(() => listed(() => walk.repo.worktrees(checkout)));

  await Promise.all(
    worktrees
      .filter((worktree) => !walk.found.has(worktree) && !excludedPath(worktree, walk.excludes))
      .map(async (worktree) => {
        const next = await walk.git(() => identify(walk.repo, worktree, report(walk)));
        if (next) add(walk, next);
      }),
  );
}

async function collectSubmodules(walk: IWalk, checkout: ICheckout) {
  const paths = (await walk.git(() => listed(() => walk.repo.submodules(checkout))))
    .map((path) => resolve(checkout.root, path))
    .filter((path) => placeInRoot(checkout.root, path) === "inside");

  await Promise.all(
    paths.map(async (submodule) => {
      const real = await walk.fs(() => realpath(submodule).catch(() => undefined));
      if (!real || !unseen(walk, real)) return;
      walk.visited.add(real);
      if (await walk.fs(() => isCheckout(real))) await collect(walk, real);
    }),
  );
}

// one repo git can't list (an old git, a broken .gitmodules) never stops the scan
function listed(list: () => Promise<string[]>) {
  return list().catch((): string[] => []);
}

function add(walk: IWalk, checkout: ICheckout) {
  walk.found.set(checkout.root, checkout);
  walk.events.progress?.(walk.found.size);
}

function report(walk: IWalk) {
  return walk.events.report ?? (() => {});
}

function unseen(walk: IWalk, real: string) {
  return !walk.visited.has(real) && !excludedPath(real, walk.excludes);
}

function excludedPath(path: string, excludes: string[]) {
  return excludes.some((excluded) => placeInRoot(excluded, path) !== "outside");
}

function realOrResolved(path: string) {
  return realpath(path).catch(() => resolve(path));
}

// the entry's own name decides, so a visible link to ~/.projects is walked
function canDescend(entry: Dirent, place: IFolderPlace) {
  return (entry.isDirectory() || entry.isSymbolicLink()) && !skippedFolder(entry.name, place);
}

async function isCheckout(path: string) {
  const entries = await readdir(path).catch((): string[] => []);

  return entries.includes(".git");
}
