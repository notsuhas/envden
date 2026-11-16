# Sweep 2 function checklist

Ordered source steps are retained below. PENDING entries have not completed manual comparison.

## apps/cli/src/links/approval.ts :: checkoutApproval

PENDING

Ordered steps, including branches:

```ts
export function checkoutApproval(
  state: ILocalState,
  checkout: ICheckout,
): "approved" | "changed" | "ask" {
  const sameRoot = state.approved.find((item) => item.root === checkout.root);

  if (
    sameRoot &&
    (state.aliases[sameRoot.repoId] ?? sameRoot.repoId) !==
      (state.aliases[checkout.repoId] ?? checkout.repoId)
  )
    return "changed";

  return state.approved.some(
    (item) =>
      item.root === checkout.root &&
      item.gitDir === checkout.gitDir &&
      item.identity === checkout.identity &&
      (state.aliases[item.repoId] ?? item.repoId) ===
        (state.aliases[checkout.repoId] ?? checkout.repoId),
  )
    ? "approved"
    : "ask";
}
```

## apps/cli/src/links/approval.ts :: approvedCheckout

PENDING

Ordered steps, including branches:

```ts
export async function approvedCheckout(
  repo: Pick<IRepoAdapter, "checkoutAt">,
  state: ILocalState,
  root: string,
) {
  const checkout = await repo.checkoutAt(root);

  return checkout && checkoutApproval(state, checkout) === "approved" ? checkout : undefined;
}
```

## apps/cli/src/links/approval.ts :: checkoutLabel

PENDING

Ordered steps, including branches:

```ts
export function checkoutLabel(
  state: ILocalState,
  checkout: ICheckout,
  files: string[],
  userHome: string,
): string {
  const worktree =
    checkout.registeredWorktree &&
    state.approved.some(
      (item) => item.gitDir === checkout.gitDir && item.repoId === checkout.repoId,
    );

  const path = homePath(checkout.root, userHome);
  const found = files.length ? files.join(", ") : "files from the vault";

  return worktree ? `${path}, worktree of ${checkout.repoId} (${found})` : `${path} (${found})`;
}
```

## apps/cli/src/links/prune.ts :: pruneMissingCheckouts

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function pruneMissingCheckouts(
  home: string,
  state: ILocalState,
  notice: (message: string) => void,
  now: () => number,
) {
  return withStateLock(home, async () => {
    for (const approval of state.approved) {
      try {
        await lstat(approval.root);
      } catch (cause) {
        if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
        const parent = await lstat(dirname(approval.root)).catch(() => undefined);

        if (!parent || (approval.rootDevice !== undefined && parent.dev !== approval.rootDevice))
          continue;

        state.approved = state.approved.filter((item) => item.root !== approval.root);

        await removeCheckoutBases(
          home,
          state.links.filter((item) => item.root === approval.root),
          state.links.filter((item) => item.root !== approval.root),
          now,
        );

        await removeConflictTargets(home, approval.root, now);

        state.links = state.links.filter((item) => item.root !== approval.root);
        notice(`Missing checkout removed: ${approval.root}`);
      }
    }

    await saveState(home, state, now);
  });
}
```

## apps/cli/src/links/file.ts :: linkFile

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function linkFile(
  adapters: TAdapters,
  state: ILocalState,
  checkout: ICheckout,
  placement: IPlacementAdapter,
  path: string,
  choose: (path: string) => Promise<"separate" | "store" | "skip"> = chooseVersion,
): Promise<TLinkResult> {
  const destination = join(checkout.root, path);
  const store = storePath(adapters.home, state.aliases[checkout.repoId] ?? checkout.repoId, path);
  const existing = state.links.find((item) => item.root === checkout.root && item.path === path);

  if (existing) {
    await relinkExisting(adapters, checkout, placement, destination, existing);

    return { kind: "done" };
  }

  if ((await lstat(destination)).isSymbolicLink()) {
    // the user's own link: the caller offers to take it over or counts it
    if ((await placement.inspect(store, destination)) !== "linked") {
      const link = await readlink(destination);
      const target = resolve(dirname(destination), link);

      return {
        kind: "own-link",
        link: { checkout, path, link, target: await realpath(target).catch(() => target) },
      };
    }

    if (!(await exists(store))) {
      await placement.remove(store, destination);
      const shown = homePath(destination, await realHome(adapters.userHome));
      console.error(`envden: removed ${sanitizeTerminal(shown)}, a link to a deleted copy`);

      return { kind: "done" };
    }

    state.links.push({ root: checkout.root, path, store, mode: placement.mode });

    return { kind: "done" };
  }

  const choice = await storeChoice(store, destination, choose, adapters.now);

  if (choice === "oversized") return { kind: "done" };

  if (choice === "skip") {
    console.error(`envden: ${sanitizeTerminal(destination)} differs from the synced copy; skipped`);

    return { kind: "done" };
  }

  await adapters.repo.ensureIgnored(checkout, path);

  if (choice === "separate") {
    state.links.push({ root: checkout.root, path, store, mode: "copy", localOnly: true });

    return { kind: "done" };
  }

  await placement.place(store, destination);

  if (placement.mode === "copy")
    await writeBytes(
      basePath(adapters.home, store, checkout.root),
      await readBytes(store),
      adapters.now,
    );

  state.links.push({ root: checkout.root, path, store, mode: placement.mode });

  return { kind: "done" };
}
```

## apps/cli/src/links/file.ts :: chooseVersion

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function chooseVersion(path: string): Promise<"separate" | "store" | "skip"> {
  if (!process.stdin.isTTY) return "skip";

  const choice = await choose(`${path} differs from the synced copy`, [
    { value: "separate" as const, label: "Keep separate (local only)" },
    { value: "store" as const, label: "Use the synced version" },
  ]);

  return choice;
}
```

## apps/cli/src/links/file.ts :: storeChoice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function storeChoice(
  store: string,
  destination: string,
  choose: (path: string) => Promise<"separate" | "store" | "skip">,
  now: () => number,
) {
  const content = await readFile(destination);
  const notice = fileSizeNotice(destination, content);

  if (notice) {
    console.error(notice);

    return "oversized";
  }

  try {
    const stat = await lstat(store);

    if (!stat.isFile() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_DATA", "Unsafe store file");

    if (!(await readFile(store)).equals(content)) return choose(destination);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      await atomicWrite(store, content, now);
    else throw cause;
  }

  return "store";
}
```

## apps/cli/src/links/file.ts :: copyBase

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function copyBase(
  home: string,
  store: string,
  root: string,
  mode: IPlacementAdapter["mode"],
  now: () => number,
) {
  if (mode !== "copy") return;
  await writeBytes(basePath(home, store, root), await readBytes(store), now);
}
```

## apps/cli/src/links/file.ts :: relinkExisting

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function relinkExisting(
  adapters: TAdapters,
  checkout: ICheckout,
  placement: IPlacementAdapter,
  destination: string,
  existing: ILocalState["links"][number],
) {
  if (existing.localOnly) return;
  const current = adapters.placement(existing.mode, checkout.root);
  const status = await current.inspect(existing.store, destination);
  if (status !== "relinkable" && status !== "linked") return;

  if (existing.mode !== placement.mode) {
    await placement.place(existing.store, destination);
    await copyBase(adapters.home, existing.store, checkout.root, placement.mode, adapters.now);
    existing.mode = placement.mode;
  } else if (status === "relinkable") await current.place(existing.store, destination);
}
```

## apps/cli/src/links/file.ts :: exists

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function exists(path: string) {
  try {
    await lstat(path);

    return true;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
    throw cause;
  }
}
```

## apps/cli/src/links/local-only.ts :: lockedmarkLocalOnly

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedmarkLocalOnly(
  adapters: TAdapters,
  state: ILocalState,
  root: string,
  path: string,
): Promise<void> {
  const link = state.links.find((item) => item.root === root && item.path === path);
  if (!link) throw new EnvdenError("NOT_FOUND", "File is not managed by envden");
  const placement = adapters.placement("copy", root);
  const status = await placement.inspect(link.store, join(root, path));

  if (status === "linked" || status === "relinkable")
    await placement.place(link.store, join(root, path));
  else if (status === "missing") throw new EnvdenError("NOT_FOUND", "File is missing");

  link.mode = "copy";
  link.localOnly = true;
  await saveState(adapters.home, state, adapters.now);
}
```

## apps/cli/src/links/local-only.ts :: markLocalOnly

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function markLocalOnly(...args: Parameters<typeof lockedmarkLocalOnly>) {
  return withStateLock(args[0].home, () => lockedmarkLocalOnly(...args));
}
```

## apps/cli/src/links/fork.ts :: shouldAskAlias

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function shouldAskAlias(
  state: ILocalState,
  checkout: ICheckout,
  repos: ReadonlySet<string>,
) {
  const target = checkout.upstreamRepoId;

  const roots = new Set(
    state.approved.filter((item) => item.repoId === checkout.repoId).map((item) => item.root),
  );

  return (
    !!target &&
    !state.links.some((item) => roots.has(item.root)) &&
    repos.has(target) &&
    !(state.aliasAsked ?? []).includes(checkout.repoId) &&
    !state.aliases[checkout.repoId] &&
    deriveAlias(state.aliases, checkout.repoId, target).kind === "assign"
  );
}
```

## apps/cli/src/links/fork.ts :: vaultRepos

PENDING

Ordered steps, including branches:

```ts
export async function vaultRepos(adapters: TAdapters, state: ILocalState, now: () => number) {
  if (!state.checkpoint) return new Set<string>();
  const context = await syncContext(adapters, { now, fetcher: adapters.fetcher, all: true });

  return new Set(
    readableEntries(context)
      .filter((entry) => entry.state === 1 || entry.state === 3)
      .map((entry) => entryName(context, entry).repoId),
  );
}
```

## apps/cli/src/links/fork.ts :: offerForkAlias

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function offerForkAlias(
  state: ILocalState,
  checkout: ICheckout,
  repos: ReadonlySet<string>,
  confirm: (source: string, target: string) => Promise<boolean>,
) {
  if (!shouldAskAlias(state, checkout, repos)) return;
  const target = checkout.upstreamRepoId!;
  state.aliasAsked = [...(state.aliasAsked ?? []), checkout.repoId];
  if (await confirm(checkout.repoId, target)) state.aliases[checkout.repoId] = target;
}
```

## apps/cli/src/links/alias.ts :: lockedAliasRepo

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedAliasRepo(adapters: TAdapters, source: string, target: string): Promise<void> {
  const state = await loadState(adapters.home);
  if (!state) throw new EnvdenError("NOT_FOUND", NOT_SET_UP);

  const decision = deriveAlias(state.aliases, source, target);

  if (decision.kind === "invalid")
    throw new EnvdenError("INVALID_INPUT", "Provide different repo IDs");

  if (decision.kind === "chain") throw new EnvdenError("CONFLICT", "Alias chains are not allowed");

  state.aliases[source] = target;
  await saveState(adapters.home, state, adapters.now);
}
```

## apps/cli/src/links/alias.ts :: deriveAlias

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function deriveAlias(aliases: Record<string, string>, source: string, target: string) {
  if (!source || !target || source === target) return { kind: "invalid" } as const;
  if (aliases[target] || Object.values(aliases).includes(source)) return { kind: "chain" } as const;

  return { kind: "assign" } as const;
}
```

## apps/cli/src/links/alias.ts :: aliasRepo

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function aliasRepo(...args: Parameters<typeof lockedAliasRepo>) {
  return withStateLock(args[0].home, () => lockedAliasRepo(...args));
}
```

## apps/cli/src/links/place.ts :: lockedlinkCheckout

PENDING

Ordered steps, including branches:

```ts
async function lockedlinkCheckout(
  adapters: TAdapters,
  state: ILocalState,
  checkout: ICheckout,
  approve: (checkout: ICheckout) => Promise<boolean>,
  copy = false,
  report: (message: string) => void = console.error,
): Promise<IOwnLink[]> {
  const approval = checkoutApproval(state, checkout);

  if (approval === "changed")
    throw new EnvdenError("CONFLICT", "Checkout remote changed; use envden alias");

  if (approval === "ask") {
    if (await autoApprovedWorktree(adapters, state, checkout))
      report(worktreeApprovedNotice(checkout));
    else if (!(await approve(checkout))) return [];
  }

  state.approved = state.approved.filter((item) => item.root !== checkout.root);
  state.approved.push(checkout);

  const placement = await supportedPlacement(adapters, checkout.root, copy);

  const ownLinks: IOwnLink[] = [];

  const paths = await adapters.repo.envFiles(
    checkout,
    (await readConfig(adapters.home))["env-files"],
  );

  for (const path of paths) {
    const result = await linkFile(adapters, state, checkout, placement, path);
    if (result.kind === "own-link") ownLinks.push(result.link);
  }

  return ownLinks.filter((link) => !siblingLink(link, paths));
}
```

## apps/cli/src/links/place.ts :: linkCheckout

PENDING

Ordered steps, including branches:

```ts
export function linkCheckout(...args: Parameters<typeof lockedlinkCheckout>) {
  return withStateLock(args[0].home, () => lockedlinkCheckout(...args));
}
```

## apps/cli/src/links/discovery/identify.ts :: identify

PENDING

Ordered steps, including branches:

```ts
export async function identify(
  repo: IRepoAdapter,
  path: string,
  report: (skip: IRepoSkip) => void,
) {
  try {
    const checkout = await repo.checkoutAt(path);
    if (!checkout) report({ path, reason: "Repository identity unavailable", kind: "identity" });

    return checkout;
  } catch (error) {
    report(repoSkip(path, error));

    return undefined;
  }
}

// the git adapter rejects missing, ambiguous and unsupported remotes as invalid input
```

## apps/cli/src/links/discovery/identify.ts :: repoSkip

PENDING

Ordered steps, including branches:

```ts
function repoSkip(path: string, error: unknown): IRepoSkip {
  if (error instanceof EnvdenError && error.code === "INVALID_INPUT")
    return { path, reason: error.message, kind: "remote" };

  return {
    path,
    reason: error instanceof EnvdenError ? error.message : "Repository identity unavailable",
    kind: "identity",
  };
}
```

## apps/cli/src/links/discovery/folders.ts :: skippedFolder

PENDING

Ordered steps, including branches:

```ts
export function skippedFolder(name: string, place: IFolderPlace) {
  return (
    name.startsWith(".") ||
    everywhere.has(name) ||
    (place.home && homeLevel.has(name)) ||
    (place.project && projectOutput.has(name))
  );
}
```

## apps/cli/src/links/discovery/folders.ts :: projectFolder

PENDING

Ordered steps, including branches:

```ts
export function projectFolder(names: string[]) {
  return names.some((name) => manifests.has(name));
}
```

## apps/cli/src/links/discovery/repos.ts :: discoverRepos

PENDING

Ordered steps, including branches:

```ts
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
```

## apps/cli/src/links/discovery/repos.ts :: walkFolder

PENDING

Ordered steps, including branches:

```ts
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
```

## apps/cli/src/links/discovery/repos.ts :: collect

PENDING

Ordered steps, including branches:

```ts
async function collect(walk: IWalk, path: string) {
  const checkout = await walk.git(() => identify(walk.repo, path, report(walk)));
  if (!checkout) return false;
  add(walk, checkout);
  await Promise.all([collectWorktrees(walk, checkout), collectSubmodules(walk, checkout)]);

  return true;
}

// registered worktrees count even under hidden folders (~/.t3/worktrees), which the walk never enters
```

## apps/cli/src/links/discovery/repos.ts :: collectWorktrees

PENDING

Ordered steps, including branches:

```ts
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
```

## apps/cli/src/links/discovery/repos.ts :: collectSubmodules

PENDING

Ordered steps, including branches:

```ts
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
```

## apps/cli/src/links/discovery/repos.ts :: listed

PENDING

Ordered steps, including branches:

```ts
function listed(list: () => Promise<string[]>) {
  return list().catch((): string[] => []);
}
```

## apps/cli/src/links/discovery/repos.ts :: add

PENDING

Ordered steps, including branches:

```ts
function add(walk: IWalk, checkout: ICheckout) {
  walk.found.set(checkout.root, checkout);
  walk.events.progress?.(walk.found.size);
}
```

## apps/cli/src/links/discovery/repos.ts :: report

PENDING

Ordered steps, including branches:

```ts
function report(walk: IWalk) {
  return walk.events.report ?? (() => {});
}
```

## apps/cli/src/links/discovery/repos.ts :: unseen

PENDING

Ordered steps, including branches:

```ts
function unseen(walk: IWalk, real: string) {
  return !walk.visited.has(real) && !excludedPath(real, walk.excludes);
}
```

## apps/cli/src/links/discovery/repos.ts :: excludedPath

PENDING

Ordered steps, including branches:

```ts
function excludedPath(path: string, excludes: string[]) {
  return excludes.some((excluded) => placeInRoot(excluded, path) !== "outside");
}
```

## apps/cli/src/links/discovery/repos.ts :: realOrResolved

PENDING

Ordered steps, including branches:

```ts
function realOrResolved(path: string) {
  return realpath(path).catch(() => resolve(path));
}

// the entry's own name decides, so a visible link to ~/.projects is walked
```

## apps/cli/src/links/discovery/repos.ts :: canDescend

PENDING

Ordered steps, including branches:

```ts
function canDescend(entry: Dirent, place: IFolderPlace) {
  return (entry.isDirectory() || entry.isSymbolicLink()) && !skippedFolder(entry.name, place);
}
```

## apps/cli/src/links/discovery/repos.ts :: isCheckout

PENDING

Ordered steps, including branches:

```ts
async function isCheckout(path: string) {
  const entries = await readdir(path).catch((): string[] => []);

  return entries.includes(".git");
}
```

## apps/cli/src/links/checkout/bases.ts :: removeCheckoutBases

PENDING

Ordered steps, including branches:

```ts
export async function removeCheckoutBases(
  home: string,
  removed: ILocalState["links"],
  remaining: ILocalState["links"],
  now: () => number,
) {
  for (const link of removed) {
    await preservePendingAncestor(home, link.store, now);
    await rm(basePath(home, link.store) + ".pending", { force: true });
    const bases = [basePath(home, link.store, link.root)];

    if (!remaining.some((item) => item.store === link.store)) {
      bases.push(basePath(home, link.store));
      await rm(basePath(home, link.store) + ".corrupt", { force: true });
    }

    for (const base of bases) {
      await rm(base, { force: true });
    }
  }
}
```

## apps/cli/src/links/checkout/untrack.ts :: untrack

PENDING

Ordered steps, including branches:

```ts
export async function untrack(adapters: TAdapters, path: string) {
  return withStateLock(adapters.home, async () => {
    const state = await loadState(adapters.home);
    const root = (await adapters.repo.checkoutAt(path))?.root;

    if (!root || !state?.approved.some((item) => item.root === root))
      throw new EnvdenError("NOT_FOUND", "Checkout is not tracked");

    const cancelled: string[] = [];

    for (const link of state.links.filter((item) => item.root === root)) {
      const intent = await readDeletion(adapters.home, link.store, adapters.now);

      if (intent) {
        const remaining = state.links.some(
          (item) => item.store === link.store && item.root !== root,
        );

        await requestDeletion(
          adapters.home,
          link.store,
          remaining,
          intent.entry,
          intent.targets.filter((path) => path !== join(root, link.path)),
          adapters.now,
        );

        if (!remaining) cancelled.push(...intent.targets);
      }

      await detachFile(adapters, link);
    }

    await removeCheckoutBases(
      adapters.home,
      state.links.filter((item) => item.root === root),
      state.links.filter((item) => item.root !== root),
      adapters.now,
    );

    await removeConflictTargets(adapters.home, root, adapters.now);

    state.links = state.links.filter((item) => item.root !== root);
    state.approved = state.approved.filter((item) => item.root !== root);
    await saveState(adapters.home, state, adapters.now);

    await refreshNotice(
      adapters.home,
      state,
      (root) => adapters.repo.caseInsensitive(root, true),
      adapters.now,
    );

    return cancelled;
  });
}
```

## apps/cli/src/links/checkout/untrack.ts :: detachFile

PENDING

Ordered steps, including branches:

```ts
async function detachFile(
  adapters: TAdapters,
  link: Parameters<typeof removeCheckoutBases>[1][number],
) {
  const placement = adapters.placement("copy", link.root);
  const destination = join(link.root, link.path);
  const status = await placement.inspect(link.store, destination);

  if (status !== "linked" && status !== "relinkable") return;

  if (
    link.originalLink &&
    (await regularTarget(resolve(dirname(destination), link.originalLink)))
  ) {
    await placement.remove(link.store, destination);
    await symlink(link.originalLink, destination);
  } else if ((await readBytes(link.store)) === undefined)
    await placement.remove(link.store, destination);
  else await placement.place(link.store, destination);
}
```

## apps/cli/src/links/checkout/worktree.ts :: worktreeApproval

PENDING

Ordered steps, including branches:

```ts
export function worktreeApproval(
  state: ILocalState,
  checkout: ICheckout,
  clone: ICheckout | undefined,
  enabled: boolean,
): "approved" | "ask" {
  if (
    !enabled ||
    !checkout.registeredWorktree ||
    !clone ||
    clone.registeredWorktree ||
    clone.root === checkout.root ||
    clone.gitDir !== checkout.gitDir ||
    repoOf(state, clone) !== repoOf(state, checkout) ||
    state.approved.some((item) => item.root === checkout.root)
  )
    return "ask";

  return checkoutApproval(state, clone) === "approved" ? "approved" : "ask";
}
```

## apps/cli/src/links/checkout/worktree.ts :: autoApprovedWorktree

PENDING

Ordered steps, including branches:

```ts
export async function autoApprovedWorktree(
  adapters: Pick<TAdapters, "repo" | "home">,
  state: ILocalState,
  checkout: ICheckout,
) {
  if (!checkout.registeredWorktree || checkoutApproval(state, checkout) !== "ask") return false;
  const enabled = (await readConfig(adapters.home))["auto-approve-worktrees"];

  return (
    worktreeApproval(
      state,
      checkout,
      await approvedClone(adapters.repo, state, checkout),
      enabled,
    ) === "approved"
  );
}
```

## apps/cli/src/links/checkout/worktree.ts :: adoptWorktreeAt

PENDING

Ordered steps, including branches:

```ts
export async function adoptWorktreeAt(
  adapters: Pick<TAdapters, "repo" | "home">,
  state: ILocalState,
  path: string,
  report: (message: string) => void,
) {
  const checkout = await adapters.repo.checkoutAt(path).catch(() => undefined);
  if (!checkout || !(await autoApprovedWorktree(adapters, state, checkout))) return;

  state.approved.push(checkout);
  report(worktreeApprovedNotice(checkout));
}
```

## apps/cli/src/links/checkout/worktree.ts :: worktreeApprovedNotice

PENDING

Ordered steps, including branches:

```ts
export function worktreeApprovedNotice(checkout: ICheckout) {
  return sanitizeTerminal(`Approved worktree ${checkout.root} (auto-approve-worktrees)`);
}
```

## apps/cli/src/links/checkout/worktree.ts :: approvedClone

PENDING

Ordered steps, including branches:

```ts
async function approvedClone(
  repo: Pick<IRepoAdapter, "checkoutAt">,
  state: ILocalState,
  checkout: ICheckout,
) {
  for (const item of state.approved) {
    if (item.gitDir !== checkout.gitDir || item.root === checkout.root) continue;
    const clone = await repo.checkoutAt(item.root).catch(() => undefined);
    if (clone && !clone.registeredWorktree) return clone;
  }

  return undefined;
}
```

## apps/cli/src/links/checkout/worktree.ts :: repoOf

PENDING

Ordered steps, including branches:

```ts
function repoOf(state: ILocalState, checkout: ICheckout) {
  return state.aliases[checkout.repoId] ?? checkout.repoId;
}
```

## apps/cli/src/links/checkout/repo.ts :: checkoutRepo

PENDING

Ordered steps, including branches:

```ts
export function checkoutRepo(state: ILocalState, root: string) {
  const approved = state.approved.find((item) => item.root === root);

  return approved && (state.aliases[approved.repoId] ?? approved.repoId);
}
```

## apps/cli/src/links/checkout/supported.ts :: supportedPlacement

PENDING

Ordered steps, including branches:

```ts
export async function supportedPlacement(
  adapters: TAdapters,
  root: string,
  copy = false,
  ask = consent,
  interactive = !!process.stdin.isTTY,
) {
  const mode = await checkoutPlacement(adapters, root, copy, ask, interactive);
  const placement = adapters.placement(mode, root);
  if (mode === "copy" || (await placement.supported(root))) return placement;

  if (
    interactive &&
    (await ask("Links are unavailable. Use plaintext copy mode for this checkout?"))
  ) {
    await checkoutPlacement(adapters, root, true);

    return adapters.placement("copy", root);
  }

  throw new EnvdenError(
    "INVALID_INPUT",
    "Links unavailable; explicitly select copy mode to continue",
  );
}
```

## apps/cli/src/links/checkout/mode.ts :: checkoutPlacement

PENDING

Ordered steps, including branches:

```ts
export async function checkoutPlacement(
  adapters: TAdapters,
  root: string,
  copy = false,
  ask = consent,
  interactive = !!process.stdin.isTTY,
) {
  const config = await readConfig(adapters.home);
  const configured = config.placement?.[root];

  if (copy) {
    await setConfig(
      "placement",
      JSON.stringify({ ...config.placement, [root]: "copy" }),
      adapters.home,
      adapters.now,
    );

    return "copy" as const;
  }

  if (configured) return configured;

  if (interactive && hasContainerFiles(await readdir(root, { withFileTypes: true }))) {
    const mode = (await ask("Container configuration detected. Use copy mode for this checkout?"))
      ? "copy"
      : "link";

    await setConfig(
      "placement",
      JSON.stringify({ ...config.placement, [root]: mode }),
      adapters.home,
      adapters.now,
    );

    return mode;
  }

  return "link" as const;
}
```

## apps/cli/src/links/checkout/mode.ts :: hasContainerFiles

PENDING

Ordered steps, including branches:

```ts
function hasContainerFiles(entries: Dirent[]) {
  return entries.some((entry) =>
    entry.name === ".devcontainer"
      ? entry.isDirectory()
      : entry.isFile() &&
        (entry.name === "Dockerfile" || /^docker-compose.*\.yml$/.test(entry.name)),
  );
}
```

## apps/cli/src/links/takeover/sibling.ts :: siblingLink

PENDING

Ordered steps, including branches:

```ts
export function siblingLink(own: IOwnLink, envFiles: string[]) {
  const destination = join(own.checkout.root, own.path);
  const target = relative(own.checkout.root, resolve(dirname(destination), own.link));

  return envFiles.includes(target.split(sep).join("/"));
}
```

## apps/cli/src/links/takeover/target.ts :: regularTarget

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function regularTarget(path: string) {
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}
```

## apps/cli/src/links/takeover/target.ts :: readTarget

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function readTarget(path: string) {
  return (await regularTarget(path)) ? readFile(path).catch(() => undefined) : undefined;
}
```

## apps/cli/src/links/takeover/group.ts :: groupOwnLinks

PENDING

Ordered steps, including branches:

```ts
export function groupOwnLinks(links: IOwnLink[]): IOwnLinkGroup[] {
  const groups = new Map<string, IOwnLink[]>();

  for (const link of links) groups.set(link.target, [...(groups.get(link.target) ?? []), link]);

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([target, items]) => ({ target, links: items.toSorted(byDestination) }));
}
```

## apps/cli/src/links/takeover/group.ts :: takeoverQuestion

PENDING

Ordered steps, including branches:

```ts
export function takeoverQuestion(group: IOwnLinkGroup, userHome: string): string {
  const [first, ...others] = group.links.map((link) =>
    homePath(join(link.checkout.root, link.path), userHome),
  );

  const who = others.length
    ? `${first} and ${others.length} ${others.length === 1 ? "other" : "others"} link`
    : `${first} links`;

  const [subject, object] = others.length ? ["Each checkout", "them"] : ["The checkout", "it"];

  return `${who} to ${homePath(group.target, userHome)}. Let envden manage it? ${subject} will use envden's synced copy instead of that file, and later edits to the file won't reach ${object}.`;
}

// the main clone leads the question, its worktrees follow
```

## apps/cli/src/links/takeover/group.ts :: byDestination

PENDING

Ordered steps, including branches:

```ts
function byDestination(a: IOwnLink, b: IOwnLink) {
  return (
    Number(!!a.checkout.registeredWorktree) - Number(!!b.checkout.registeredWorktree) ||
    join(a.checkout.root, a.path).localeCompare(join(b.checkout.root, b.path))
  );
}
```

## apps/cli/src/links/takeover/adopt.ts :: adoptGroup

PENDING

Ordered steps, including branches:

```ts
export async function adoptGroup(
  adapters: TAdapters,
  state: ILocalState,
  group: IOwnLinkGroup,
  copy = false,
): Promise<IOwnLink[]> {
  const home = await realHome(adapters.userHome);
  const target = sanitizeTerminal(homePath(group.target, home));
  const content = await readTarget(group.target);

  if (!content) {
    console.error(`envden: can't read ${target}; left the links to it in place`);

    return group.links;
  }

  const notice = fileSizeNotice(group.target, content);

  if (notice) {
    console.error(notice);

    return group.links;
  }

  const left: IOwnLink[] = [];

  for (const link of group.links) {
    const shown = sanitizeTerminal(homePath(join(link.checkout.root, link.path), home));
    const adopted = await adoptLink(adapters, state, link, content, copy).catch(() => undefined);

    if (adopted) continue;

    if (adopted === undefined)
      console.error(`envden: couldn't take over ${shown}; left it linked to ${target}`);
    else console.error(`envden: left ${shown} linked to ${target}: its synced copy differs`);

    left.push(link);
  }

  return left;
}

// worktrees of one repo share a store file, so the second one finds it already written
```

## apps/cli/src/links/takeover/adopt.ts :: adoptLink

PENDING

Ordered steps, including branches:

```ts
async function adoptLink(
  adapters: TAdapters,
  state: ILocalState,
  own: IOwnLink,
  content: Uint8Array,
  copy: boolean,
) {
  const { checkout, path } = own;
  const store = storePath(adapters.home, state.aliases[checkout.repoId] ?? checkout.repoId, path);
  const stored = await readBytes(store);

  if (stored === undefined) await atomicWrite(store, content, adapters.now);
  else if (!same(stored, content)) return false;

  await adapters.repo.ensureIgnored(checkout, path);
  const placement = await supportedPlacement(adapters, checkout.root, copy);
  await placement.place(store, join(checkout.root, path), undefined, own.link);

  if (placement.mode === "copy")
    await writeBytes(basePath(adapters.home, store, checkout.root), content, adapters.now);

  state.links.push({
    root: checkout.root,
    path,
    store,
    mode: placement.mode,
    originalLink: own.link,
  });

  return true;
}
```

## apps/cli/src/links/takeover/offer.ts :: offerTakeover

PENDING

Ordered steps, including branches:

```ts
export async function offerTakeover(
  adapters: TAdapters,
  state: ILocalState,
  links: IOwnLink[],
  copy = false,
  ask: (question: string) => Promise<boolean> = askInTerminal,
): Promise<IOwnLink[]> {
  const home = await realHome(adapters.userHome);
  const left: IOwnLink[] = [];

  for (const group of groupOwnLinks(links))
    if ((await regularTarget(group.target)) && (await ask(takeoverQuestion(group, home))))
      left.push(...(await adoptGroup(adapters, state, group, copy)));
    else left.push(...group.links);

  return left;
}
```

## apps/cli/src/links/takeover/offer.ts :: askInTerminal

PENDING

Ordered steps, including branches:

```ts
async function askInTerminal(question: string) {
  return !!process.stdin.isTTY && consent(question, true);
}
```

## apps/cli/src/admin/move/switch.ts :: lockedswitchServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedswitchServer(
  adapters: TAdapters,
  address: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  const server = await hello(address, undefined, fetcher, MIN_SERVER);

  const client = createClient({
    address,
    pin: server.pin,
    vaultId: context.vaultId,
    identity: context.identity,
    now,
    fetcher,
    version: VERSION,
  });

  const history = await readHistory(client, context.vaultId);
  checkFloor(context.local, history);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);

  if (
    !moved ||
    moved.body.kind !== 5 ||
    !p.equal(moved.body.payload.newPin, server.pin) ||
    !p.equal(history.state.serverPin, server.pin)
  )
    throw new EnvdenError("INVALID_DATA", "Server has no verified move to this pin");

  context.local.server = { address, pin: text(server.pin), protocol: 1 };
  await saveState(adapters.home, context.local, adapters.now);
}
```

## apps/cli/src/admin/move/switch.ts :: switchServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function switchServer(...args: Parameters<typeof lockedswitchServer>) {
  return withStateLock(args[0].home, () => lockedswitchServer(...args));
}
```

## apps/cli/src/admin/move/abort.ts :: lockedabortMove

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedabortMove(
  context: TAdminContext,
  adapters: TAdapters,
  directory: string,
  address: string | undefined,
  options: { now: () => number; fetcher: TFetch },
) {
  const history = await currentHistory(context);

  if (!p.equal(history.state.serverPin, binary(context.local.server!.pin)))
    throw new EnvdenError("MOVING", "Move already committed; resume it instead");

  if (address) {
    const savedPin = await optionalRead(join(directory, "move-pin"));
    if (!savedPin) throw new EnvdenError("INVALID_DATA", "Missing move pin");

    const destination = createClient({
      address,
      pin: binary(savedPin),
      vaultId: context.vaultId,
      identity: context.identity,
      now: options.now,
      fetcher: options.fetcher,
      version: VERSION,
    });

    try {
      await destination.request("/v1/move/discard", "POST");
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "NOT_FOUND") throw error;
    }
  }

  await context.client.request("/v1/move/unfreeze", "POST");
  await rm(join(directory, "move-address"), { force: true });
  await rm(join(directory, "move-swap.bin"), { force: true });

  await rm(join(directory, "move-pin"), { force: true });
  await adapters.keychain.delete(`envden/${adapters.home}/move-token`);
}
```

## apps/cli/src/admin/move/abort.ts :: abortMove

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function abortMove(...args: Parameters<typeof lockedabortMove>) {
  return withStateLock(args[0].adapters.home, () => lockedabortMove(...args));
}
```

## apps/cli/src/admin/move/credentials.ts :: moveCredentials

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function moveCredentials(
  adapters: TAdapters,
  directory: string,
  options: { token?: string | undefined },
) {
  const savedPin = await optionalRead(join(directory, "move-pin"));
  const tokenSlot = `envden/${adapters.home}/move-token`;

  if (options.token)
    await adapters.keychain.set(tokenSlot, new TextEncoder().encode(options.token));

  const savedToken = await adapters.keychain.get(tokenSlot);

  const token = savedToken
    ? p.decodeToken("setup", new TextDecoder().decode(savedToken))
    : undefined;

  const pin = token?.serverPin ?? (savedPin ? binary(savedPin) : undefined);
  if (!pin) throw new EnvdenError("INVALID_INPUT", "A setup token is required for a new move");

  return { token, pin, tokenSlot };
}
```

## apps/cli/src/admin/move/follow.ts :: followServerMove

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function followServerMove(
  context: TAdminContext,
  history: THistory,
  fetcher: TFetch,
  unlock?: (client: ReturnType<typeof createClient>, vaultId: Uint8Array) => Promise<void>,
) {
  checkFloor(context.local, history);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);
  if (!moved || moved.body.kind !== 5) return { kind: "unchanged" as const };
  const target = moved.body.payload;
  if (context.local.server?.pin === text(target.newPin)) return { kind: "unchanged" as const };

  const header = history.headers.find((h) =>
    p.equal(h.body.listHead, p.objectHash(p.EntryCodec, moved, "entry")),
  );

  if (!header || header.body.op !== 10)
    throw new EnvdenError("INVALID_DATA", "Move header missing");

  await hello(target.newAddress, target.newPin, fetcher, MIN_SERVER);

  const client = createClient({
    address: target.newAddress,
    pin: target.newPin,
    vaultId: context.vaultId,
    identity: context.identity,
    version: VERSION,
    now: context.now,
    fetcher,
  });

  const swap: p.ISwap = {
    expectedHead: header.body.prev,
    header,
    entries: [moved],
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
  };

  await client.request("/v1/swap", "POST", p.SwapCodec.write(swap));
  if (unlock) await unlock(client, context.vaultId);
  const destination = await readHistory(client, context.vaultId);

  checkFloor(
    {
      ...context.local,
      headers: history.headers.map((h) => text(p.signedCodec(p.ManifestHeaderCodec).write(h))),
    },
    destination,
  );

  if (!p.equal(destination.state.serverPin, target.newPin))
    throw new EnvdenError("INVALID_DATA", "Destination pin does not match the move");

  context.local.server = { address: target.newAddress, pin: text(target.newPin), protocol: 1 };
  await saveState(context.adapters.home, context.local, context.now);

  return { kind: "moved" as const, client };
}
```

## apps/cli/src/admin/move/resume.ts :: resumeMoveAddress

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function resumeMoveAddress(context: TAdminContext, directory: string) {
  const history = await currentHistory(context);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);
  const header = history.headers.at(-1)!;

  if (moved?.body.kind === 5 && header.body.op === 10) {
    await atomicWrite(join(directory, "move-pin"), text(moved.body.payload.newPin), context.now);

    await atomicWrite(
      join(directory, "move-swap.bin"),
      p.SwapCodec.write({
        expectedHead: header.body.prev,
        header,
        entries: [moved],
        files: undefined,
        keyring: undefined,
        envelope: undefined,
        skPub: undefined,
        opaqueRecord: undefined,
        approver: undefined,
      }),
      context.now,
    );

    return moved.body.payload.newAddress;
  }

  return undefined;
}
```

## apps/cli/src/admin/move/run.ts :: lockedmoveServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedmoveServer(
  adapters: TAdapters,
  options: {
    address?: string | undefined;
    token?: string | undefined;
    resume?: boolean | undefined;
    abort?: boolean | undefined;
    password: string;
    now: () => number;
    fetcher: TFetch;
  },
) {
  const context = await adminContext(adapters, options.now, options.fetcher);
  await login(context.client, context.vaultId, options.password);
  const directory = join(adapters.home, "state");
  const savedAddress = await optionalRead(join(directory, "move-address"));
  let address = options.address ?? savedAddress;

  if (options.abort) {
    await abortMove(context, adapters, directory, address, options);

    return;
  }

  if (!address && options.resume) {
    address = await resumeMoveAddress(context, directory);
  }

  if (!address) throw new EnvdenError("INVALID_INPUT", "Specify the destination server");
  const { token, pin, tokenSlot } = await moveCredentials(adapters, directory, options);
  await hello(address, pin, options.fetcher, MIN_SERVER);

  const destination = createClient({
    address,
    pin,
    vaultId: context.vaultId,
    identity: context.identity,
    now: options.now,
    fetcher: options.fetcher,
    version: VERSION,
    ...(token
      ? {
          proof: (request: p.IRequest) =>
            p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
        }
      : {}),
  });

  await atomicWrite(join(directory, "move-address"), address, adapters.now);
  await atomicWrite(join(directory, "move-pin"), text(pin), adapters.now);
  let swap: p.ISwap;

  swap = await preparedSwap(context, destination, directory, pin, address, options);

  requireDestination(swap, pin, address);

  await context.client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  await destination.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  await login(destination, context.vaultId, options.password);
  await switchServer(adapters, address, options.now, options.fetcher);
  await rm(join(directory, "move-swap.bin"), { force: true });
  await rm(join(directory, "move-address"), { force: true });
  await rm(join(directory, "move-pin"), { force: true });
  await adapters.keychain.delete(tokenSlot);
}
```

## apps/cli/src/admin/move/run.ts :: moveServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function moveServer(...args: Parameters<typeof lockedmoveServer>) {
  return withStateLock(args[0].home, () => lockedmoveServer(...args));
}
```

## apps/cli/src/admin/move/run.ts :: requireDestination

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function requireDestination(swap: p.ISwap, pin: Uint8Array, address: string) {
  const move = swap.entries[0]?.body;

  if (move?.kind !== 5 || !p.equal(move.payload.newPin, pin) || move.payload.newAddress !== address)
    throw new EnvdenError("INVALID_INPUT", "Resume destination differs from the stored move");
}
```

## apps/cli/src/admin/move/run.ts :: preparedSwap

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function preparedSwap(
  context: Awaited<ReturnType<typeof adminContext>>,
  destination: ReturnType<typeof createClient>,
  directory: string,
  pin: Uint8Array,
  address: string,
  options: Parameters<typeof lockedmoveServer>[1],
) {
  let swap: p.ISwap;

  try {
    swap = p.decode(p.SwapCodec, new Uint8Array(await readFile(join(directory, "move-swap.bin"))));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    await context.client.request("/v1/move/sk-pub");
    await destination.request("/v1/move/session", "POST");
    await context.client.request("/v1/move/freeze", "POST");
    const history = await currentHistory(context);
    await copyServer(context.client, destination, history);
    await registerPassword(destination, context.vaultId, options.password);

    const entry = p.signObject<p.TEntry>(
      p.EntryCodec,
      {
        vaultId: context.vaultId,
        seq: history.state.seq + 1n,
        parent: history.state.head,
        kind: 5,
        payload: { oldPin: history.state.serverPin, newPin: pin, newAddress: address },
        signer: context.identity.record.id,
      },
      context.identity.keys.objSk,
      "entry",
    );

    swap = adminSwap(history, context.identity, 10, options.now(), { entries: [entry] });

    await atomicWrite(join(directory, "move-swap.bin"), p.encode(p.SwapCodec, swap), context.now);
  }

  return swap;
}
```

## apps/cli/src/admin/rejoin/classify.ts :: checkRejoin

PENDING

Ordered steps, including branches:

```ts
export async function checkRejoin(adapters: TAdapters, history: THistory) {
  const local = await loadState(adapters.home);
  if (!local?.checkpoint) return;
  const identity = await deviceIdentity(adapters.keychain, adapters.home, local.deviceName);

  const result = classifyNonMember({
    deviceId: identity.record.id,
    storedHeaders: local.headers.map((h) =>
      p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(h)),
    ),
    storedEntries: local.entries.map((e) => p.decode(p.signedCodec(p.EntryCodec), binary(e))),
    verifiedHeaders: history.headers,
    verifiedEntries: history.entries,
    state: history.state,
  });

  if (result.kind === "fork" || result.kind === "rollback")
    throw new EnvdenError(
      result.kind === "fork" ? "FORK" : "ROLLBACK",
      "Rejoin history conflicts with the stored floor",
    );

  return result;
}
```

## apps/cli/src/admin/rejoin/classify.ts :: adoptRejoin

PENDING

Ordered steps, including branches:

```ts
export async function adoptRejoin(adapters: TAdapters, history: THistory) {
  const result = await checkRejoin(adapters, history);

  return result;
}
```

## apps/cli/src/admin/rejoin/classify.ts :: rejoinIdentity

PENDING

Ordered steps, including branches:

```ts
export async function rejoinIdentity(adapters: TAdapters, name: string) {
  return deviceIdentity(adapters.keychain, `${adapters.home}/rejoin`, name);
}
```

## apps/cli/src/admin/rejoin/classify.ts :: finishRejoinIdentity

PENDING

Ordered steps, including branches:

```ts
export async function finishRejoinIdentity(adapters: TAdapters) {
  const next = await adapters.keychain.get(`envden/${adapters.home}/rejoin/device`);
  if (!next) throw new EnvdenError("INVALID_DATA", "Missing rejoin identity");
  await adapters.keychain.set(`envden/${adapters.home}/device`, next);
  await adapters.keychain.delete(`envden/${adapters.home}/rejoin/device`);

  for (const file of await readdir(join(adapters.home, "state")))
    if (file.startsWith("rejoin-floor-"))
      await rm(join(adapters.home, "state", file), { force: true });
}
```

## apps/cli/src/admin/rejoin/run.ts :: runRejoin

PENDING

Ordered steps, including branches:

```ts
export async function runRejoin(
  adapters: TAdapters,
  address: string,
  options: TPreferenceOptions & {
    recoveryKit?: string;
    recovery?: boolean;
    name?: string;
    resume?: boolean;
  },
  now: () => number,
) {
  if (options.recoveryKit || options.recovery) {
    const name = await askDeviceName(options.name, adapters.hostname);
    const kit = await readKit(options.recoveryKit);

    await kitRejoin(adapters, {
      address,
      vaultId: kit.vaultId,
      secretKey: kit.secretKey,
      name,
      password: await secret("Master password"),
      now,
      fetcher: adapters.fetcher,
    });
  } else await pairingJoin(adapters, { ...options, address, now, rejoin: true });

  await completeJoin(adapters, now, undefined, options);
}
```

## apps/cli/src/admin/rejoin/kit.ts :: kitRejoin

PENDING

Ordered steps, including branches:

```ts
export function kitRejoin(
  adapters: Parameters<typeof kitJoin>[0],
  options: Parameters<typeof kitJoin>[1],
) {
  return kitJoin(adapters, { ...options, rejoin: true });
}
```

## apps/cli/src/admin/recovery/envelope.ts :: sealRecoveryEnvelope

PENDING

Ordered steps, including branches:

```ts
export function sealRecoveryEnvelope(
  context: TAdminContext,
  history: THistory,
  keys: { encSk: Uint8Array; objSk: Uint8Array },
  password: string,
  secret: Uint8Array,
  now: () => number,
) {
  return p.sealEnvelope(
    {
      vaultId: context.vaultId,
      recoveryEncSk: keys.encSk,
      recoveryObjSk: keys.objSk,
      checkpoint: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
      sealedAt: BigInt(now()),
    },
    password,
    secret,
  );
}
```

## apps/cli/src/admin/recovery/pending.ts :: pendingPath

PENDING

Ordered steps, including branches:

```ts
function pendingPath(context: TAdminContext) {
  return join(context.adapters.home, "state", "kit-replace");
}
```

## apps/cli/src/admin/recovery/pending.ts :: savePendingKit

PENDING

Ordered steps, including branches:

```ts
export function savePendingKit(context: TAdminContext, swap: p.ISwap) {
  return atomicWrite(pendingPath(context), text(p.SwapCodec.write(swap)), context.now);
}
```

## apps/cli/src/admin/recovery/pending.ts :: clearPendingKit

PENDING

Ordered steps, including branches:

```ts
export function clearPendingKit(context: TAdminContext) {
  return rm(pendingPath(context), { force: true });
}

// Finishes a kit swap whose response was lost; an uncommitted one is dropped, so its kit never took effect.
```

## apps/cli/src/admin/recovery/pending.ts :: settlePendingKit

PENDING

Ordered steps, including branches:

```ts
export async function settlePendingKit(context: TAdminContext) {
  const saved = await optionalRead(pendingPath(context));
  if (!saved) return false;

  const swap = p.decode(p.SwapCodec, binary(saved));
  const history = await currentHistory(context);
  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");
  const committed = historyHasHeader(history, hash);

  if (committed) await acceptAdmin(context, swap, history);
  await clearPendingKit(context);

  return committed;
}
```

## apps/cli/src/admin/recovery/reset.ts :: attemptResetPassword

PENDING

Ordered steps, including branches:

```ts
async function attemptResetPassword(
  adapters: TAdapters,
  password: string,
  kit: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const secret = p.decodeSecretKey(kit);
  const keys = p.generateRecoveryKeys();

  try {
    const context = await adminContext(adapters, now, fetcher, (request) =>
      p.signSKProof(secret, request.vaultId, request),
    );

    const history = await currentHistory(context);
    const recovery = { id: p.recoveryId(keys), encPub: keys.encPub, objPub: keys.objPub };
    const { change, keyring } = await nextEpoch(context, history, recovery);

    const entry = p.signObject<p.TEntry>(
      p.EntryCodec,
      {
        vaultId: context.vaultId,
        seq: history.state.seq + 1n,
        parent: history.state.head,
        signer: context.identity.record.id,
        kind: 4,
        payload: { recovery, change },
      },
      context.identity.keys.objSk,
      "entry",
    );

    const record = await registerPassword(context.client, context.vaultId, password);

    const envelope = await sealRecoveryEnvelope(context, history, keys, password, secret, now);

    await commitAdmin(
      context,
      adminSwap(history, context.identity, 9, now(), {
        entries: [entry],
        keyring,
        envelope,
        opaqueRecord: new Uint8Array(Buffer.from(record, "base64url")),
      }),
    );
  } finally {
    secret.fill(0);
    keys.encSk.fill(0);
    keys.objSk.fill(0);
  }
}
```

## apps/cli/src/admin/recovery/reset.ts :: resetPassword

PENDING

Ordered steps, including branches:

```ts
export function resetPassword(...args: Parameters<typeof attemptResetPassword>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptResetPassword(...args)));
}
```

## apps/cli/src/admin/recovery/credentials.ts :: attemptReplaceKit

PENDING

Ordered steps, including branches:

```ts
async function attemptReplaceKit(
  adapters: TAdapters,
  password: string,
  now: () => number,
  fetcher: TFetch,
  material: IKitMaterial,
  removed?: Uint8Array,
) {
  const context = await adminContext(adapters, now, fetcher);
  if (await settlePendingKit(context)) return { kind: "finished" as const };

  await login(context.client, context.vaultId, password);
  const history = await currentHistory(context);
  const { keys, secret } = material;
  const recovery = { id: p.recoveryId(keys), encPub: keys.encPub, objPub: keys.objPub };
  const { change, keyring } = await nextEpoch(context, history, recovery, removed);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      signer: context.identity.record.id,
      ...(removed
        ? { kind: 2, payload: { device: removed, newRecovery: recovery, change } }
        : { kind: 4, payload: { recovery, change } }),
    },
    context.identity.keys.objSk,
    "entry",
  );

  const envelope = await sealRecoveryEnvelope(context, history, keys, password, secret, now);

  const swap = adminSwap(history, context.identity, removed ? 5 : 7, now(), {
    entries: [entry],
    keyring,
    envelope,
    skPub: p.skPub(secret, context.vaultId),
  });

  const kit = {
    vaultId: p.base32(context.vaultId),
    secretKey: p.encodeSecretKey(secret),
    server: context.local.server!.address,
  };

  await savePendingKit(context, swap);
  await material.show(kit);
  await commitAdmin(context, swap);
  await clearPendingKit(context);

  return { kind: "replaced" as const, kit };
}
```

## apps/cli/src/admin/recovery/credentials.ts :: attemptChangePassword

PENDING

Ordered steps, including branches:

```ts
async function attemptChangePassword(
  adapters: TAdapters,
  oldPassword: string,
  newPassword: string,
  kit: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  await login(context.client, context.vaultId, oldPassword);
  const history = await currentHistory(context);
  const box = new Uint8Array(await (await context.client.request("/v1/envelope")).arrayBuffer());

  if (!p.equal(p.H("envelope-blob", box), history.headers.at(-1)!.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");

  const secret = p.decodeSecretKey(kit);
  const envelope = await p.openEnvelope(box, oldPassword, secret, context.vaultId);

  try {
    const record = await registerPassword(context.client, context.vaultId, newPassword);

    const sealed = await p.sealEnvelope(
      {
        ...envelope,
        checkpoint: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
        sealedAt: BigInt(now()),
      },
      newPassword,
      secret,
    );

    await commitAdmin(
      context,
      adminSwap(history, context.identity, 8, now(), {
        envelope: sealed,
        opaqueRecord: new Uint8Array(Buffer.from(record, "base64url")),
      }),
    );
  } finally {
    secret.fill(0);
    envelope.recoveryEncSk.fill(0);
    envelope.recoveryObjSk.fill(0);
  }
}

// The kit is shown before the swap is submitted, and once per call so head retries keep the same secret.
```

## apps/cli/src/admin/recovery/credentials.ts :: replaceKit

PENDING

Ordered steps, including branches:

```ts
export function replaceKit(
  adapters: TAdapters,
  password: string,
  now: () => number,
  onKit: (kit: IReplacementKit) => Promise<void>,
  fetcher: TFetch = adapters.fetcher,
  removed?: Uint8Array,
) {
  return withStateLock(adapters.home, async () => {
    const keys = p.generateRecoveryKeys();
    const secret = p.randomBytes(16);
    let shown = false;

    const show = async (kit: IReplacementKit) => {
      if (shown) return;
      await onKit(kit);
      shown = true;
    };

    try {
      return await retryHead(() =>
        attemptReplaceKit(adapters, password, now, fetcher, { keys, secret, show }, removed),
      );
    } finally {
      keys.encSk.fill(0);
      keys.objSk.fill(0);
      secret.fill(0);
    }
  });
}
```

## apps/cli/src/admin/recovery/credentials.ts :: changePassword

PENDING

Ordered steps, including branches:

```ts
export function changePassword(...args: Parameters<typeof attemptChangePassword>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptChangePassword(...args)));
}
```

## apps/cli/src/admin/shared/history.ts :: checkFloor

PENDING

Ordered steps, including branches:

```ts
export function checkFloor(local: ILocalState, history: THistory) {
  const bySequence = new Map(history.headers.map((header) => [header.body.seq, header]));

  for (const encoded of local.headers) {
    const stored = p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(encoded));
    const remote = bySequence.get(stored.body.seq);

    if (!remote)
      throw new EnvdenError("ROLLBACK", "Server is behind this device; run envden server repair");

    if (
      !p.equal(
        p.objectHash(p.ManifestHeaderCodec, stored, "manifest"),
        p.objectHash(p.ManifestHeaderCodec, remote, "manifest"),
      )
    )
      throw new EnvdenError("FORK", "Server history conflicts with stored headers");
  }
}
```

## apps/cli/src/admin/shared/history.ts :: currentHistory

PENDING

Ordered steps, including branches:

```ts
export async function currentHistory(context: TAdminContext) {
  const history = await readHistory(context.client, context.vaultId);
  checkFloor(context.local, history);

  return history;
}
```

## apps/cli/src/admin/shared/context.ts :: adminContext

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function adminContext(
  adapters: TAdapters,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
  proof?: (request: p.IRequest) => Uint8Array,
) {
  const local = await loadState(adapters.home);

  if (!local?.server || !local.vaultId) throw new EnvdenError("NOT_FOUND", NOT_SET_UP);

  const identity = await deviceIdentity(adapters.keychain, adapters.home, local.deviceName);
  const vaultId = p.unbase32(local.vaultId);

  const client = createClient({
    address: local.server.address,
    pin: binary(local.server.pin),
    vaultId,
    identity,
    now,
    fetcher,
    version: VERSION,
    ...(proof ? { proof } : {}),
  });

  return { adapters, local, identity, vaultId, client, now };
}

export type TAdminContext = Awaited<ReturnType<typeof adminContext>>;
```

## apps/cli/src/admin/shared/epoch.ts :: nextEpoch

PENDING

Ordered steps, including branches:

```ts
export async function nextEpoch(
  context: TAdminContext,
  history: THistory,
  recovery = history.state.recovery,
  removed?: Uint8Array,
) {
  const { key, ring } = await currentMaterial(context, history);
  const nextKey = p.randomBytes(32);
  const epoch = history.state.epoch + 1;

  const members = [...history.state.devices.values()].filter(
    (device) => !removed || !p.equal(device.id, removed),
  );

  const wraps = await Promise.all(
    [...members, recovery].map((member) =>
      p.sealWrap(nextKey, context.vaultId, epoch, member.id, member.encPub),
    ),
  );

  wraps.sort((a, b) => p.compare(a.recipient, b.recipient));

  const keyring = p.sealKeyring(
    {
      vaultId: context.vaultId,
      epoch,
      idKey: ring.idKey,
      older: [...ring.older, { epoch: ring.epoch, key }],
    },
    nextKey,
  );

  return {
    change: { epoch, keyCommit: p.keyCommit(nextKey, context.vaultId, epoch), wraps },
    keyring,
  };
}
```

## apps/cli/src/admin/shared/transfer.ts :: optionalObject

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function optionalObject(client: TClient, path: string) {
  try {
    return new Uint8Array(await (await client.request(path)).arrayBuffer());
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "NOT_FOUND") return undefined;
    throw error;
  }
}
```

## apps/cli/src/admin/shared/transfer.ts :: historySwaps

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function historySwaps(
  history: THistory,
  files: (hash: Uint8Array) => Promise<Uint8Array | undefined>,
  after = 0n,
): Promise<p.ISwap[]> {
  const swaps: p.ISwap[] = [];
  let listSeq = -1n;

  for (const header of history.headers) {
    if (header.body.seq <= after) {
      listSeq = header.body.listSeq;
      continue;
    }

    const body = await files(header.body.filesHash);

    if (body && !p.equal(p.H("files", body), header.body.filesHash))
      throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

    swaps.push({
      expectedHead: header.body.prev,
      header,
      entries: history.entries.filter(
        (e) => e.body.seq > listSeq && e.body.seq <= header.body.listSeq,
      ),
      files: body ? p.decode(p.FilesCodec, body) : undefined,
      keyring: undefined,
      envelope: undefined,
      skPub: undefined,
      opaqueRecord: undefined,
      approver: undefined,
    });

    listSeq = header.body.listSeq;
  }

  return swaps;
}
```

## apps/cli/src/admin/shared/transfer.ts :: copyServer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function copyServer(source: TClient, destination: TClient, history: THistory) {
  const hashes = p.ObjectsResponseSchema.parse(
    await (await source.request("/v1/blobs")).json(),
  ).objects;

  for (const hash of hashes) {
    const bytes = await optionalObject(source, `/v1/blobs/${hash}`);

    if (!bytes || text(p.H("blob", bytes)) !== hash)
      throw new EnvdenError("INVALID_DATA", "Move blob hash mismatch");

    await destination.request(`/v1/blobs/${hash}`, "PUT", bytes);
  }

  const swaps = await historySwaps(history, (hash) =>
    optionalObject(source, `/v1/files/${text(hash)}`),
  );

  await destination.request("/v1/move/chain", "POST", p.encode(p.list(p.SwapCodec), swaps));

  for (const header of history.headers) {
    const hash = header.body.keyringHash;
    const bytes = await optionalObject(source, `/v1/keyrings/${text(hash)}`);
    if (bytes) await destination.request(`/v1/move/material/keyring/${text(hash)}`, "PUT", bytes);
  }

  const envelope = await optionalObject(source, "/v1/envelope");
  const head = history.headers.at(-1)!;

  if (!envelope || !p.equal(p.H("envelope-blob", envelope), head.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Move envelope hash mismatch");

  await destination.request(
    `/v1/move/material/envelope/${text(head.body.envelopeHash)}`,
    "PUT",
    envelope,
  );

  const skPub = await optionalObject(source, "/v1/move/sk-pub");
  if (!skPub) throw new EnvdenError("INVALID_DATA", "Missing secret key public key");

  await destination.request(
    `/v1/move/material/skPub/${text(p.H("sk-public", skPub))}`,
    "PUT",
    skPub,
  );

  const period = p.UnlockPeriodSchema.parse(await (await source.request("/v1/move/period")).json());
  await destination.request("/v1/move/period", "PUT", period);
}
```

## apps/cli/src/admin/shared/commit.ts :: commitAdmin

PENDING

Ordered steps, including branches:

```ts
export async function commitAdmin(context: TAdminContext, swap: p.ISwap) {
  const { history } = await submitAdmin(context, swap);

  await acceptAdmin(context, swap, history);
}
```

## apps/cli/src/admin/shared/commit.ts :: acceptAdmin

PENDING

Ordered steps, including branches:

```ts
export async function acceptAdmin(context: TAdminContext, swap: p.ISwap, history: THistory) {
  const server = context.local.server;
  if (!server) throw new EnvdenError("NOT_FOUND", "Missing server configuration");

  await acceptJoin(
    context.adapters,
    context.client,
    context.identity,
    server.address,
    history.state.serverPin,
    history,
    p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
  );

  if (swap.envelope) {
    await atomicWrite(
      join(context.adapters.home, "state", "envelope.bin"),
      swap.envelope,
      context.now,
    );
  }
}
```

## apps/cli/src/admin/shared/submission.ts :: submitAdmin

PENDING

Ordered steps, including branches:

```ts
export async function submitAdmin(context: TAdminContext, swap: p.ISwap) {
  await context.client.request("/v1/swap", "POST", p.SwapCodec.write(swap));
  const history = await readHistory(context.client, context.vaultId);
  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");

  if (!historyHasHeader(history, hash))
    throw new EnvdenError("INVALID_DATA", "Server did not commit the requested swap");

  return { history, swap };
}
```

## apps/cli/src/admin/shared/swap.ts :: adminSwap

PENDING

Ordered steps, including branches:

```ts
export function adminSwap(
  history: THistory,
  identity: TDeviceIdentity,
  op: p.IManifestHeader["op"],
  now: number,
  fields: Partial<Omit<p.ISwap, "expectedHead" | "header">> = {},
): p.ISwap {
  const before = history.headers.at(-1)!;
  const expectedHead = p.objectHash(p.ManifestHeaderCodec, before, "manifest");
  const entries = fields.entries ?? [];
  const last = entries.at(-1);
  const changed = last?.body;

  const epoch =
    changed && (changed.kind === 2 || changed.kind === 3 || changed.kind === 4)
      ? changed.payload.change.epoch
      : before.body.epoch;

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...before.body,
      seq: before.body.seq + 1n,
      prev: expectedHead,
      op,
      epoch,
      listSeq: last?.body.seq ?? before.body.listSeq,
      listHead: last ? p.objectHash(p.EntryCodec, last, "entry") : before.body.listHead,
      keyringHash: fields.keyring ? p.H("keyring-blob", fields.keyring) : before.body.keyringHash,
      envelopeHash: fields.envelope
        ? p.H("envelope-blob", fields.envelope)
        : before.body.envelopeHash,
      filesHash: fields.files
        ? p.H("files", p.encode(p.FilesCodec, fields.files))
        : before.body.filesHash,
      createdAt: BigInt(now),
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "manifest",
  );

  return {
    expectedHead,
    header,
    entries,
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
    ...fields,
  };
}
```

## apps/cli/src/admin/shared/material.ts :: currentMaterial

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function currentMaterial(context: TAdminContext, history: THistory) {
  const head = history.headers.at(-1)!;
  const wrap = deviceWrap(history.entries, context.identity.record.id);

  const commit = history.state.commits.get(head.body.epoch);
  if (!wrap || !commit) throw new EnvdenError("UNAUTHORIZED", "Device is no longer a member");

  const key = await p.openWrap(
    wrap,
    context.identity.keys.encSk,
    context.identity.record.encPub,
    context.vaultId,
    head.body.epoch,
    commit,
  );

  const box = new Uint8Array(
    await (
      await context.client.request(`/v1/keyrings/${text(head.body.keyringHash)}`)
    ).arrayBuffer(),
  );

  if (!p.equal(p.H("keyring-blob", box), head.body.keyringHash))
    throw new EnvdenError("INVALID_DATA", "Keyring hash mismatch");

  const knownId = await context.adapters.keychain.get(`envden/${context.adapters.home}/id-key`);

  const ring = p.openKeyring(
    box,
    key,
    context.vaultId,
    head.body.epoch,
    history.state.commits,
    knownId ?? undefined,
  );

  const keys = new Map([
    ...ring.older.map((item) => [item.epoch, item.key] as const),
    [ring.epoch, key] as const,
  ]);

  return { key, ring, keys };
}
```

## apps/cli/src/admin/repair/finish.ts :: attemptFinishRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function attemptFinishRepair(
  adapters: TAdapters,
  options: {
    token: string;
    password: string;
    without?: string[] | undefined;
    acceptLost?: boolean | undefined;
    now: () => number;
    fetcher: TFetch;
  },
) {
  const resumed = await resumeClose(adapters, options.token, options.now, options.fetcher);
  if (resumed) return resumed;
  const context = await repairContext(adapters, options.token, options.now, options.fetcher);
  let history: THistory = await readHistory(context.client, context.vaultId);

  const status = p.RepairStatusSchema.parse(
    await (await context.client.request("/v1/repair/status")).json(),
  );

  if (!p.equal(binary(status.repairId), context.repairId))
    throw new EnvdenError("INVALID_DATA", "Repair identity mismatch");

  history = await dropDevices(context, history, options.without ?? []);

  const reports = await repairReports(context, history);

  const missing = missingReportMembers(history.state, reports);

  if (missing.length)
    return { kind: "missing-reports" as const, devices: missing.map((d) => d.name) };

  const files = await repairFiles(context, history);

  const available = await availableBlobs(context);

  const gaps = classifyMissingBlobs(files, available, reports);

  if (deriveGapAction(gaps, options.acceptLost).kind === "report") {
    return missingBlobNames(context, history, gaps);
  }

  if (gaps.lost.length) {
    await fixLost(context, history, files, gaps.lost, available, context.repairId);
    history = await readHistory(context.client, context.vaultId);
  }

  await closeRepair(adapters, context, history, status, options);

  const result = await resumeClose(adapters, options.token, options.now, options.fetcher);
  if (!result) throw new EnvdenError("INVALID_DATA", "Repair close was not committed");

  return result;
}
```

## apps/cli/src/admin/repair/finish.ts :: finishRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function finishRepair(...args: Parameters<typeof attemptFinishRepair>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptFinishRepair(...args)));
}
```

## apps/cli/src/admin/repair/drop.ts :: dropDevices

PENDING

Ordered steps, including branches:

```ts
export async function dropDevices(context: TAdminContext, initial: THistory, without: string[]) {
  let history = initial;

  for (const name of without) {
    const device = [...history.state.devices.values()].find(
      (d) => d.name === name || p.base32(d.id) === name,
    );

    if (!device) continue;

    if (p.equal(device.id, context.identity.record.id) || history.state.devices.size === 1)
      throw new EnvdenError("INVALID_INPUT", "Cannot drop this device or the last device");

    const swap = await revocationSwap(context, history, device, context.now());
    history = (await submitAdmin(context, swap)).history;
  }

  return history;
}
```

## apps/cli/src/admin/repair/login.ts :: repairLogin

PENDING

Ordered steps, including branches:

```ts
export async function repairLogin(
  client: TClient,
  vaultId: Uint8Array,
  password: string,
  kind: "login" | "register",
) {
  const identifiers = p.unlockIdentifiers(vaultId).identifiers;

  if (kind === "register") {
    const start = await p.opaqueStartRegistration(password);

    const body = p.MessageResponseSchema.parse(
      await (
        await client.request("/v1/opaque/registration/start", "POST", {
          message: start.registrationRequest,
        })
      ).json(),
    );

    const finish = await p.opaqueFinishRegistration({
      password,
      registrationResponse: body.message,
      clientRegistrationState: start.clientRegistrationState,
      identifiers,
    });

    return { kind: "registration" as const, message: finish.registrationRecord };
  }

  const start = await p.opaqueStartLogin(password);

  const body = p.MessageResponseSchema.parse(
    await (
      await client.request("/v1/opaque/login/start", "POST", {
        purpose: "unlock",
        message: start.startLoginRequest,
      })
    ).json(),
  );

  const finish = await p.opaqueFinishLogin({
    password,
    loginResponse: body.message,
    clientLoginState: start.clientLoginState,
    identifiers,
  });

  if (!finish) throw new EnvdenError("UNAUTHORIZED", "Password login failed");

  return { kind: "login" as const, purpose: "unlock" as const, message: finish.finishLoginRequest };
}
```

## apps/cli/src/admin/repair/lost.ts :: fixLost

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function fixLost(
  context: TAdminContext,
  history: THistory,
  files: p.IFiles,
  lost: p.IFileEntry[],
  available: ReadonlySet<string>,
  repairId: Uint8Array,
) {
  const { key, ring, keys } = await currentMaterial(context, history);

  const older = await Promise.all(
    history.headers.map(async (header) => {
      const bytes = await optionalObject(
        context.client,
        `/v1/files/${text(header.body.filesHash)}`,
      );

      if (bytes && !p.equal(p.H("files", bytes), header.body.filesHash))
        throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

      return { header: header.body, files: bytes ? p.decode(p.FilesCodec, bytes) : undefined };
    }),
  );

  const losses = new Set(lost.map((e) => text(e.fileId)));
  const entries: p.IFileEntry[] = [];
  const report: string[] = [];

  for (const file of files.entries) {
    if (!losses.has(text(file.fileId))) {
      entries.push(file);
      continue;
    }

    const c = {
      vaultId: context.vaultId,
      epoch: file.epoch,
      fileId: file.fileId,
      version: file.version,
    };

    const name = p.openFileName(file.name, keys.get(file.epoch)!, ring.idKey, c);
    const next = { ...c, epoch: ring.epoch, version: file.version + 1n };

    const candidate = chooseRecoveryCandidate({
      fileId: file.fileId,
      beforeVersion: file.version,
      history: older,
      availableBlobs: available,
    });

    let blobHash: Uint8Array = new Uint8Array(32);
    let state: p.IFileEntry["state"] = 4;

    if (candidate.kind === "recovered") {
      const entry = candidate.entry;
      const box = await optionalObject(context.client, `/v1/blobs/${text(entry.blobHash)}`);

      if (box) {
        const old = { ...c, epoch: entry.epoch, version: entry.version };

        const content = p.openFile(
          box,
          keys.get(entry.epoch)!,
          ring.idKey,
          old,
          entry.blobHash,
          name,
        );

        const blob = p.sealFile(content, key, next);
        blobHash = p.H("blob", blob);
        await context.client.request(`/v1/blobs/${text(blobHash)}`, "PUT", blob);
        state = 3;
      }
    }

    report.push(
      `${name.repoId}/${name.path}: ${state === 3 && candidate.kind === "recovered" ? `recovered from ${whenText(Number(candidate.header.createdAt), context.now())}` : "lost; no verified older copy"}`,
    );

    entries.push({
      ...file,
      epoch: next.epoch,
      version: next.version,
      state,
      blobHash,
      name: p.sealFileName(name, key, next),
    });
  }

  const swap = adminSwap(history, context.identity, 11, context.now(), { files: { entries } });

  await atomicWrite(
    join(context.adapters.home, "state", `repair-report-${text(repairId)}`),
    report.join("\n"),
    context.now,
  );

  await submitAdmin(context, swap);
}
```

## apps/cli/src/admin/repair/chain.ts :: localRepairChain

PENDING

Ordered steps, including branches:

```ts
export function localRepairChain(encoded: string[]) {
  const entries = encoded.map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), new Uint8Array(Buffer.from(value, "base64url"))),
  );

  return { entries, chain: verifyChain(entries) };
}
```

## apps/cli/src/admin/repair/upload.ts :: cachedBytes

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function cachedBytes(path: string) {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
```

## apps/cli/src/admin/repair/upload.ts :: repairContext

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function repairContext(
  adapters: TAdapters,
  tokenText: string,
  now: () => number,
  fetcher: TFetch,
) {
  const token = p.decodeToken("repair", tokenText);

  const context = await adminContext(adapters, now, fetcher, (request) =>
    p.tokenProof("repair", p.tokenKey("repair", token.secret), request),
  );

  if (!context.local.server || !p.equal(binary(context.local.server.pin), token.serverPin))
    throw new EnvdenError("INVALID_INPUT", "Repair token is for another server");

  const { chain } = localRepairChain(context.local.entries);
  const repairId = p.H("repair-id", token.secret);

  if (chain.kind !== "valid" || isReusedRepairToken(repairId, chain.state.repairIds))
    throw new EnvdenError("INVALID_DATA", "Repair token was already used");

  return { ...context, repairId };
}
```

## apps/cli/src/admin/repair/upload.ts :: lockeduploadRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockeduploadRepair(
  adapters: TAdapters,
  token: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await repairContext(adapters, token, now, fetcher);
  const remote = await readHistory(context.client, context.vaultId);

  const headers = context.local.headers.map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const { entries, chain } = localRepairChain(context.local.entries);
  if (chain.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid stored chain");
  const stored = { headers, entries, state: chain.state };
  const remoteHead = remote.headers.at(-1)!;
  const evidence = join(adapters.home, "state", `repair-restored-${text(context.repairId)}`);

  if ((await optionalRead(evidence)) === undefined)
    await atomicWrite(
      evidence,
      text(p.objectHash(p.ManifestHeaderCodec, remoteHead, "manifest")),
      adapters.now,
    );

  const localHead = headers.at(-1)!;

  if (localHead.body.seq > remoteHead.body.seq)
    checkFloor(
      {
        ...context.local,
        headers: remote.headers.map((h) => text(p.signedCodec(p.ManifestHeaderCodec).write(h))),
      },
      stored,
    );
  else checkFloor(context.local, remote);

  const files = context.local.files
    ? p.decode(p.FilesCodec, binary(context.local.files))
    : { entries: [] };

  const blobs = await uploadCachedBlobs(context, files);

  if (localHead.body.seq > remoteHead.body.seq) {
    const swaps = await historySwaps(
      stored,
      async (hash) => {
        if (context.local.files && p.equal(p.H("files", binary(context.local.files)), hash))
          return binary(context.local.files);

        return cachedBytes(join(adapters.home, "state", "file-lists", text(hash)));
      },
      remoteHead.body.seq,
    );

    await context.client.request("/v1/repair/chain", "POST", p.encode(p.list(p.SwapCodec), swaps));
  }

  if (context.local.keyring)
    await context.client.request(
      `/v1/repair/material/keyring/${text(localHead.body.keyringHash)}`,
      "PUT",
      binary(context.local.keyring),
    );

  const envelope = await cachedBytes(join(adapters.home, "state", "envelope.bin"));

  const repaired = await readHistory(context.client, context.vaultId);

  if (
    envelope &&
    p.equal(p.H("envelope-blob", envelope), repaired.headers.at(-1)!.body.envelopeHash)
  )
    await context.client.request(
      `/v1/repair/material/envelope/${text(p.H("envelope-blob", envelope))}`,
      "PUT",
      envelope,
    );

  const history = await readHistory(context.client, context.vaultId);

  await acceptJoin(
    adapters,
    context.client,
    context.identity,
    context.local.server!.address,
    history.state.serverPin,
    history,
    p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
  );

  blobs.sort(p.compare);

  const report = p.signObject(
    p.RepairReportCodec,
    {
      vaultId: context.vaultId,
      repairId: context.repairId,
      head: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
      blobs,
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "repair-report",
  );

  await context.client.request(
    "/v1/repair/report",
    "PUT",
    p.signedCodec(p.RepairReportCodec).write(report),
  );

  return context;
}
```

## apps/cli/src/admin/repair/upload.ts :: uploadRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function uploadRepair(...args: Parameters<typeof lockeduploadRepair>) {
  return withStateLock(args[0].home, () => lockeduploadRepair(...args));
}
```

## apps/cli/src/admin/repair/upload.ts :: uploadCachedBlobs

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function uploadCachedBlobs(
  context: Awaited<ReturnType<typeof repairContext>>,
  files: p.IFiles,
) {
  const adapters = context.adapters;
  const blobs: Uint8Array[] = [];

  for (const file of files.entries) {
    if (![1, 3].includes(file.state)) continue;
    const bytes = await cachedBytes(join(adapters.home, "state", "blobs", text(file.blobHash)));
    if (!bytes) continue;

    if (!p.equal(p.H("blob", bytes), file.blobHash))
      throw new EnvdenError("INVALID_DATA", "Cached blob hash mismatch");

    await context.client.request(`/v1/blobs/${text(file.blobHash)}`, "PUT", bytes);
    blobs.push(file.blobHash);
  }

  return blobs;
}
```

## apps/cli/src/admin/repair/resume.ts :: saveClose

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function saveClose(adapters: TAdapters, swap: p.ISwap) {
  await atomicWrite(
    join(adapters.home, "state", "repair-close"),
    text(p.SwapCodec.write(swap)),
    adapters.now,
  );
}
```

## apps/cli/src/admin/repair/resume.ts :: resumeClose

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function resumeClose(
  adapters: TAdapters,
  token: string,
  now: () => number,
  fetcher: TFetch,
) {
  const saved = await optionalRead(join(adapters.home, "state", "repair-close"));
  if (!saved) return;
  const swap = p.decode(p.SwapCodec, binary(saved));
  const close = swap.entries[0]?.body;
  const repairId = p.H("repair-id", p.decodeToken("repair", token).secret);

  if (close?.kind !== 6 || !p.equal(close.payload.repairId, repairId)) {
    await rm(join(adapters.home, "state", "repair-close"), { force: true });

    return;
  }

  const context = await adminContext(adapters, now, fetcher);
  let history;

  try {
    history = await readHistory(context.client, context.vaultId);
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "RESTORED_MODE") return;
    throw error;
  }

  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");

  if (!historyHasHeader(history, hash)) {
    await rm(join(adapters.home, "state", "repair-close"), { force: true });
    throw new EnvdenError("FORK", "Repair close is not on the server chain");
  }

  await acceptJoin(
    adapters,
    context.client,
    context.identity,
    context.local.server!.address,
    history.state.serverPin,
    history,
    p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
  );

  const envelope = await optionalObject(context.client, "/v1/envelope");

  const restoredIndex = history.headers.findIndex((h) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), close.payload.restoredHead),
  );

  if (restoredIndex < 0) throw new EnvdenError("INVALID_DATA", "Missing restored checkpoint");

  const result = {
    kind: "finished" as const,
    report: await optionalRead(join(adapters.home, "state", `repair-report-${text(repairId)}`)),
    replaceKit: refuseSecretKeyProof(
      history.headers
        .slice(restoredIndex + 1)
        .filter((h) => h.body.seq < swap.header.body.seq)
        .map((h) => h.body),
      !!envelope && p.equal(p.H("envelope-blob", envelope), swap.header.body.envelopeHash),
    ),
  };

  await rm(join(adapters.home, "state", "repair-close"), { force: true });

  return result;
}
```

## apps/cli/src/admin/devices/rotate.ts :: attemptRotateVault

PENDING

Ordered steps, including branches:

```ts
async function attemptRotateVault(
  adapters: TAdapters,
  password: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  await login(context.client, context.vaultId, password);
  const history = await currentHistory(context);
  const { change, keyring } = await nextEpoch(context, history);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 3,
      payload: { change },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  await commitAdmin(
    context,
    adminSwap(history, context.identity, 6, now(), { entries: [entry], keyring }),
  );
}
```

## apps/cli/src/admin/devices/rotate.ts :: rotateVault

PENDING

Ordered steps, including branches:

```ts
export function rotateVault(...args: Parameters<typeof attemptRotateVault>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRotateVault(...args)));
}
```

## apps/cli/src/admin/devices/revocation.ts :: revocationSwap

PENDING

Ordered steps, including branches:

```ts
export async function revocationSwap(
  context: TAdminContext,
  history: THistory,
  device: { id: Uint8Array },
  now: number,
) {
  const { change, keyring } = await nextEpoch(context, history, history.state.recovery, device.id);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 2,
      payload: { device: device.id, newRecovery: undefined, change },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  return adminSwap(history, context.identity, 4, now, { entries: [entry], keyring });
}
```

## apps/cli/src/admin/devices/recovery-holders.ts :: recoveryHolders

PENDING

Ordered steps, including branches:

```ts
export function recoveryHolders(history: THistory): ReadonlySet<string> {
  const holders = new Set<string>();

  for (let index = 0; index < history.headers.length; index++) {
    const header = history.headers[index]!;
    const previous = history.headers[index - 1];

    if (!previous || !p.equal(previous.body.envelopeHash, header.body.envelopeHash))
      holders.add(p.base32(header.body.signer));
  }

  for (const signed of history.entries) {
    const entry = signed.body;

    if (
      entry.kind === 1 &&
      !history.entries.some((item) =>
        item.body.kind === 0
          ? p.equal(item.body.payload.device.id, entry.signer)
          : item.body.kind === 1 && p.equal(item.body.payload.device.id, entry.signer),
      )
    )
      holders.add(p.base32(entry.payload.device.id));
  }

  return holders;
}
```

## apps/cli/src/admin/devices/exposed-file.ts :: inspectExposedFile

PENDING

Ordered steps, including branches:

```ts
export async function inspectExposedFile(
  context: TAdminContext,
  entry: p.IFileEntry,
  keys: Map<number, Uint8Array>,
  ring: Awaited<ReturnType<typeof currentMaterial>>["ring"],
  names: Map<string, { repoId: string; path: string; keys: Set<string> }>,
) {
  const c = {
    vaultId: context.vaultId,
    epoch: entry.epoch,
    fileId: entry.fileId,
    version: entry.version,
  };

  const name = openedName(entry, keys, ring.idKey, context.vaultId);
  if (!name) return true;

  const id = text(entry.fileId);
  const found = names.get(id) ?? { ...name, keys: new Set<string>() };
  names.set(id, found);
  if (![1, 3].includes(entry.state)) return false;
  const box = await retainedBlob(context.client, entry.blobHash);

  if (!box) {
    return true;
  }

  const content = p.openFile(box, keys.get(entry.epoch)!, ring.idKey, c, entry.blobHash, name);
  const parsed = parseEnv(content.content);

  if (parsed.kind === "parsed")
    for (const assignment of parsed.entries) found.keys.add(assignment.key);
  else return true;

  return false;
}
```

## apps/cli/src/admin/devices/remove.ts :: attemptRemoveDevice

PENDING

Ordered steps, including branches:

```ts
async function attemptRemoveDevice(
  adapters: TAdapters,
  name: string,
  password: string | (() => Promise<string>),
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
  newKit = false,
  recommend?: () => Promise<boolean>,
  confirm?: (exposure: Awaited<ReturnType<typeof exposedNames>>) => Promise<boolean>,
  onKit?: (kit: IReplacementKit) => Promise<void>,
) {
  const context = await adminContext(adapters, now, fetcher);
  const target = await removalTarget(context, name);
  if (!target) return { kind: "finished" as const };
  const { history, device } = target;

  const credential = typeof password === "string" ? password : await password();
  await login(context.client, context.vaultId, credential);
  const exposure = await exposedNames(context, history);

  if (confirm && !(await confirm(exposure)))
    throw new EnvdenError("INVALID_INPUT", "Device removal cancelled");

  const recommendNewKit = recoveryHolders(history).has(p.base32(device.id));

  const replace = newKit || (recommendNewKit && recommend ? await recommend() : false);

  if (replace) await replaceKit(adapters, credential, now, kitOutput(onKit), fetcher, device.id);
  else await commitAdmin(context, await revocationSwap(context, history, device, now()));

  return { kind: "removed" as const, recommendNewKit, exposure };
}
```

## apps/cli/src/admin/devices/remove.ts :: removeDevice

PENDING

Ordered steps, including branches:

```ts
export function removeDevice(...args: Parameters<typeof attemptRemoveDevice>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRemoveDevice(...args)));
}

// A settled removal whose device is already gone counts as this removal finishing.
```

## apps/cli/src/admin/devices/remove.ts :: removalTarget

PENDING

Ordered steps, including branches:

```ts
async function removalTarget(context: TAdminContext, name: string) {
  const finished = await settlePendingKit(context);
  const history = await currentHistory(context);
  if (finished && !findDevice(history, name)) return undefined;

  return { history, device: removableDevice(history, context.identity.record.id, name) };
}
```

## apps/cli/src/admin/devices/remove.ts :: kitOutput

PENDING

Ordered steps, including branches:

```ts
function kitOutput(onKit?: (kit: IReplacementKit) => Promise<void>) {
  if (!onKit) throw new EnvdenError("INTERNAL", "Missing recovery kit output");

  return onKit;
}
```

## apps/cli/src/admin/devices/remove.ts :: removableDevice

PENDING

Ordered steps, including branches:

```ts
function removableDevice(
  history: Awaited<ReturnType<typeof currentHistory>>,
  ownId: Uint8Array,
  name: string,
) {
  const device = findDevice(history, name);

  if (!device) throw new EnvdenError("NOT_FOUND", "Device not found");

  if (p.equal(device.id, ownId) || history.state.devices.size === 1)
    throw new EnvdenError("INVALID_INPUT", "Cannot remove this device or the last device");

  return device;
}
```

## apps/cli/src/admin/devices/remove.ts :: findDevice

PENDING

Ordered steps, including branches:

```ts
function findDevice(history: Awaited<ReturnType<typeof currentHistory>>, name: string) {
  return [...history.state.devices.values()].find(
    (item) => item.name === name || p.base32(item.id) === name,
  );
}
```

## apps/cli/src/admin/devices/exposure.ts :: exposedNames

PENDING

Ordered steps, including branches:

```ts
export async function exposedNames(context: TAdminContext, history: THistory) {
  const { ring, keys } = await currentMaterial(context, history);

  const names = new Map<string, { repoId: string; path: string; keys: Set<string> }>();
  let incomplete = false;

  const lists = new Set<string>();
  const blobs = new Set<string>();

  for (const header of history.headers) {
    const hash = text(header.body.filesHash);
    if (lists.has(hash)) continue;
    lists.add(hash);
    const files = await retainedList(context.client, header.body.filesHash);

    if (!files) {
      incomplete = true;
      continue;
    }

    for (const entry of files.entries) {
      const blob = text(entry.blobHash);
      if (blobs.has(blob)) continue;
      blobs.add(blob);
      if (await inspectExposedFile(context, entry, keys, ring, names)) incomplete = true;
    }
  }

  return {
    files: [...names.values()].map((name) => ({
      repoId: name.repoId,
      path: name.path,
      keys: [...name.keys].sort(),
    })),
    incomplete,
  };
}
```

## apps/cli/src/admin/devices/rename.ts :: renameCheck

PENDING

Ordered steps, including branches:

```ts
export function renameCheck(
  devices: Iterable<p.IDeviceRecord>,
  ownId: Uint8Array,
  name: string,
): "rename" | "unchanged" | "taken" | "invalid" {
  if (!p.isDeviceName(name)) return "invalid";

  const holder = [...devices].find((device) => device.name === name);
  if (!holder) return "rename";

  return p.equal(holder.id, ownId) ? "unchanged" : "taken";
}
```

## apps/cli/src/admin/devices/rename.ts :: attemptRenameDevice

PENDING

Ordered steps, including branches:

```ts
async function attemptRenameDevice(
  adapters: TAdapters,
  name: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  const history = await currentHistory(context);
  const own = context.identity.record.id;
  const check = renameCheck(history.state.devices.values(), own, name);

  if (check === "unchanged") return { kind: "unchanged" as const };
  if (check === "taken") throw new EnvdenError("INVALID_INPUT", "Another device has that name");

  if (check === "invalid")
    throw new EnvdenError(
      "INVALID_INPUT",
      "Device names are 1-64 bytes with no invisible characters",
    );

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 7,
      payload: { device: own, name },
      signer: own,
    },
    context.identity.keys.objSk,
    "entry",
  );

  await commitAdmin(context, adminSwap(history, context.identity, 13, now(), { entries: [entry] }));

  return { kind: "renamed" as const };
}
```

## apps/cli/src/admin/devices/rename.ts :: renameDevice

PENDING

Ordered steps, including branches:

```ts
export function renameDevice(...args: Parameters<typeof attemptRenameDevice>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRenameDevice(...args)));
}
```

## apps/cli/src/admin/devices/list.ts :: listDevices

PENDING

Ordered steps, including branches:

```ts
export async function listDevices(
  adapters: TAdapters,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  const history = await currentHistory(context);
  const holders = recoveryHolders(history);

  const seen = p.DevicesResponseSchema.parse(
    await (await context.client.request("/v1/devices")).json(),
  ).devices;

  return [...history.state.devices.values()].map((device) => ({
    id: p.base32(device.id),
    name: device.name,
    clientVersion: seen.find((item) => item.id === text(device.id))?.clientVersion ?? null,
    unconfirmed: !seen.find((item) => item.id === text(device.id))?.confirmed,
    recoveryKeyHeld: holders.has(p.base32(device.id)),
    current: p.equal(device.id, context.identity.record.id),
  }));
}
```

## apps/cli/src/admin/repair/completion/gaps.ts :: deriveGapAction

PENDING

Ordered steps, including branches:

```ts
export function deriveGapAction(
  gaps: { missing: unknown[]; lost: unknown[] },
  acceptLost: boolean | undefined,
) {
  if (gaps.missing.length || (gaps.lost.length && !acceptLost)) return { kind: "report" } as const;

  return { kind: "finish" } as const;
}
```

## apps/cli/src/admin/repair/completion/blobs.ts :: availableBlobs

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function availableBlobs(context: Awaited<ReturnType<typeof repairContext>>) {
  const hashes = p.ObjectsResponseSchema.parse(
    await (await context.client.request("/v1/blobs")).json(),
  ).objects;

  const available = new Set<string>();

  for (const hash of hashes) {
    const blob = await optionalObject(context.client, `/v1/blobs/${hash}`);
    if (!blob) continue;

    if (!p.equal(p.H("blob", blob), binary(hash)))
      throw new EnvdenError("INVALID_DATA", "Repair blob hash mismatch");

    available.add(p.base32(binary(hash)));
  }

  return available;
}
```

## apps/cli/src/admin/repair/completion/reports.ts :: repairReports

PENDING

Ordered steps, including branches:

```ts
export async function repairReports(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: THistory,
) {
  const encoded = p.ObjectsResponseSchema.parse(
    await (await context.client.request("/v1/repair/reports")).json(),
  ).objects;

  const reports = filterRepairReports({
    reports: encoded.flatMap((r) => {
      const result = decodeServerObject({
        received: binary(r),
        codec: p.RepairReportCodec,
        label: "repair-report",
        mismatch: "fork",
        members: [...history.state.devices.values()],
        currentVersion: VERSION,
        latestVersion: context.local.latest ?? VERSION,
      });

      if (result.kind === "known") return [result.value];

      if (result.kind === "update-required")
        throw new EnvdenError("UPDATE_REQUIRED", "Update envden to read server data");

      if (result.kind === "unreadable")
        throw new EnvdenError("INVALID_DATA", "Unreadable data from server");

      return [];
    }),
    repairId: context.repairId,
    state: history.state,
    headerHashes: new Set(
      history.headers.map((h) => p.base32(p.objectHash(p.ManifestHeaderCodec, h, "manifest"))),
    ),
  });

  return reports;
}
```

## apps/cli/src/admin/repair/completion/names.ts :: missingBlobNames

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function missingBlobNames(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
  gaps: ReturnType<typeof classifyMissingBlobs>,
) {
  const { key, ring } = await currentMaterial(context, history);

  const keys = new Map([
    ...ring.older.map((e) => [e.epoch, e.key] as const),
    [ring.epoch, key] as const,
  ]);

  const name = (entry: p.IFileEntry) =>
    p.openFileName(entry.name, keys.get(entry.epoch)!, ring.idKey, {
      vaultId: context.vaultId,
      epoch: entry.epoch,
      fileId: entry.fileId,
      version: entry.version,
    });

  return {
    kind: "missing-blobs" as const,
    missing: gaps.missing.map(name),
    lost: gaps.lost.map(name),
  };
}
```

## apps/cli/src/admin/repair/completion/close.ts :: closeRepair

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function closeRepair(
  adapters: TAdapters,
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
  status: ReturnType<typeof p.RepairStatusSchema.parse>,
  options: { password: string; now: () => number },
) {
  const restoredIndex = history.headers.findIndex((h) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), binary(status.restoredHead)),
  );

  if (restoredIndex < 0) throw new EnvdenError("INVALID_DATA", "Restored head is not on the chain");

  const evidence = await optionalRead(
    join(adapters.home, "state", `repair-restored-${text(context.repairId)}`),
  );

  const evidenceIndex = history.headers.findIndex(
    (h) => evidence === text(p.objectHash(p.ManifestHeaderCodec, h, "manifest")),
  );

  if (evidenceIndex < restoredIndex)
    throw new EnvdenError("INVALID_DATA", "Restored head exceeds the observed restore point");

  const after = history.headers.slice(restoredIndex + 1).map((h) => h.body);

  const finish = await repairLogin(
    context.client,
    context.vaultId,
    options.password,
    repairLoginDecision(after),
  );

  const record = finish.kind === "registration" ? binary(finish.message) : undefined;

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 6,
      payload: { repairId: context.repairId, restoredHead: binary(status.restoredHead) },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  const swap = adminSwap(history, context.identity, 12, options.now(), {
    entries: [entry],
    ...(record ? { opaqueRecord: record } : {}),
  });

  await saveClose(adapters, swap);

  await context.client.request("/v1/repair/finish", "POST", {
    ...finish,
    swap: text(p.SwapCodec.write(swap)),
  });
}
```

## apps/cli/src/admin/repair/completion/files.ts :: repairFiles

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function repairFiles(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
) {
  const head = history.headers.at(-1)!;

  const fileBytes = new Uint8Array(
    await (await context.client.request(`/v1/files/${text(head.body.filesHash)}`)).arrayBuffer(),
  );

  if (!p.equal(p.H("files", fileBytes), head.body.filesHash))
    throw new EnvdenError("INVALID_DATA", "Repair file list hash mismatch");

  const files = p.decode(p.FilesCodec, fileBytes);

  return files;
}
```

## apps/cli/src/vault/genesis.ts :: createGenesis

PENDING

Ordered steps, including branches:

```ts
export async function createGenesis(identity: TDeviceIdentity, pin: Uint8Array, now: number) {
  const recoveryKeys = p.generateRecoveryKeys();

  const recovery = {
    id: p.recoveryId(recoveryKeys),
    encPub: recoveryKeys.encPub,
    objPub: recoveryKeys.objPub,
  };

  const genesis = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: new Uint8Array(32),
      seq: 0n,
      parent: new Uint8Array(32),
      kind: 0,
      payload: {
        serverPin: pin,
        device: identity.record,
        recovery,
        vaultNonce: p.randomBytes(32),
        createdAt: BigInt(now),
      },
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "entry",
  );

  const vaultId = p.objectHash(p.EntryCodec, genesis, "entry");
  const epochKey = p.randomBytes(32);

  const wraps = await Promise.all(
    [identity.record, recovery].map((member) =>
      p.sealWrap(epochKey, vaultId, 1, member.id, member.encPub),
    ),
  );

  wraps.sort((a, b) => p.compare(a.recipient, b.recipient));

  const epoch = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId,
      seq: 1n,
      parent: vaultId,
      signer: identity.record.id,
      kind: 3,
      payload: { change: { epoch: 1, keyCommit: p.keyCommit(epochKey, vaultId, 1), wraps } },
    },
    identity.keys.objSk,
    "entry",
  );

  const idKey = p.randomBytes(32);
  const keyring = p.sealKeyring({ vaultId, epoch: 1, idKey, older: [] }, epochKey);

  return { vaultId, genesis, epoch, keyring, epochKey, idKey, recoveryKeys };
}

export type TGenesis = Awaited<ReturnType<typeof createGenesis>>;
```

## apps/cli/src/vault/history.ts :: objects

PENDING

Ordered steps, including branches:

```ts
async function objects(client: TClient, path: string, from: bigint): Promise<string[]> {
  const result: string[] = [];

  while (true) {
    const value: unknown = await (await client.request(`${path}?from=${from}`)).json();
    const page = p.ObjectsResponseSchema.parse(value).objects;
    if (!page.length) return result;
    const last = binary(page.at(-1)!);

    const seq = p.u64.read(new p.Reader(last.subarray(34, 42)));

    if (seq < from) throw new EnvdenError("INVALID_DATA", "Invalid history page");
    result.push(...page);
    from = seq + 1n;
  }
}
```

## apps/cli/src/vault/history.ts :: readHistory

PENDING

Ordered steps, including branches:

```ts
export async function readHistory(
  client: TClient,
  vaultId: Uint8Array,
  local?: {
    entries: string[];
    headers: string[];
    latest?: string;
    verifiedState?: IDeviceListState;
  },
): Promise<THistory> {
  const entries = (local?.entries ?? []).map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), binary(value)),
  );

  const headers = (local?.headers ?? []).map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const states = new Map<bigint, IDeviceListState>();
  const state = storedState(entries, anchoredState(entries, local?.verifiedState), states);

  const incoming = await objects(client, "/v1/entries", (entries.at(-1)?.body.seq ?? -1n) + 1n);

  const decoded = decodeHistoryEntries(
    incoming.map(binary),
    local?.entries.map(binary),
    local?.latest,
    state,
  );

  entries.push(...decoded.entries);
  for (const [seq, at] of decoded.states) states.set(seq, at);
  const finalState = decoded.state;
  const firstHeader = headers.length;

  const incomingHeaders = await objects(
    client,
    "/v1/headers",
    (headers.at(-1)?.body.seq ?? 0n) + 1n,
  );

  for (const value of incomingHeaders)
    headers.push(
      decodeHistoryHeader(
        binary(value),
        entries,
        local?.headers.map(binary),
        local?.latest,
        states,
      ),
    );

  if (!p.equal(finalState.vaultId, vaultId) || headers.length === 0)
    throw new EnvdenError("INVALID_DATA", "Invalid vault history");

  verifyNewHeaders(headers, firstHeader, states, vaultId);
  verifyRestoredHeads(headers, entries);

  const final = headers.at(-1)!.body;

  if (final.listSeq !== finalState.seq || !p.equal(final.listHead, finalState.head))
    throw new EnvdenError("INVALID_DATA", "Uncommitted device list entries");

  return { entries, headers, state: finalState, states };
}

interface IHistory {
  entries: p.ISigned<p.TEntry>[];
  headers: p.ISigned<p.IManifestHeader>[];
  state: IDeviceListState;
  states?: ReadonlyMap<bigint, IDeviceListState>;
}

export type THistory = IHistory;
```

## apps/cli/src/vault/history.ts :: storedState

PENDING

Ordered steps, including branches:

```ts
function storedState(
  entries: p.ISigned<p.TEntry>[],
  stored: IDeviceListState | undefined,
  states: Map<bigint, IDeviceListState>,
) {
  let state = stored;

  if (stored) states.set(stored.seq, stored);

  for (const entry of entries) {
    if (stored && entry.body.seq <= stored.seq) continue;
    const applied = applyEntry(state, entry);

    if (applied.kind !== "valid")
      throw new EnvdenError("INVALID_DATA", "Invalid stored device list");

    state = applied.state;
    states.set(state.seq, state);
  }

  return state;
}
```

## apps/cli/src/vault/history.ts :: verifyNewHeaders

PENDING

Ordered steps, including branches:

```ts
function verifyNewHeaders(
  headers: p.ISigned<p.IManifestHeader>[],
  firstHeader: number,
  states: ReadonlyMap<bigint, IDeviceListState>,
  vaultId: Uint8Array,
) {
  let previous: Uint8Array = firstHeader
    ? p.objectHash(p.ManifestHeaderCodec, headers[firstHeader - 1]!, "manifest")
    : new Uint8Array(32);

  let previousEpoch = headers[firstHeader - 1]?.body.epoch ?? 0;

  for (let index = firstHeader; index < headers.length; index++) {
    const signed = headers[index]!;
    const h = signed.body;
    const at = states.get(h.listSeq);
    if (!at) throw new EnvdenError("INVALID_DATA", "Invalid device list");
    const signer = at.devices.get(p.base32(h.signer));

    if (!validHeader(signed, signer, vaultId, BigInt(index + 1), previous, at, previousEpoch))
      throw new EnvdenError("INVALID_DATA", "Invalid manifest history");

    previous = p.objectHash(p.ManifestHeaderCodec, signed, "manifest");
    previousEpoch = h.epoch;
  }
}
```

## apps/cli/src/vault/history.ts :: verifyRestoredHeads

PENDING

Ordered steps, including branches:

```ts
function verifyRestoredHeads(
  headers: p.ISigned<p.IManifestHeader>[],
  entries: p.ISigned<p.TEntry>[],
) {
  const earlier = new Set<string>();
  let next = 0;

  for (const signed of headers) {
    for (; next < entries.length && entries[next]!.body.seq <= signed.body.listSeq; next++) {
      const e = entries[next]!.body;

      if (e.kind === 6 && !earlier.has(p.base32(e.payload.restoredHead)))
        throw new EnvdenError("INVALID_DATA", "Invalid repair history");
    }

    earlier.add(p.base32(p.objectHash(p.ManifestHeaderCodec, signed, "manifest")));
  }
}
```

## apps/cli/src/vault/history.ts :: validHeader

PENDING

Ordered steps, including branches:

```ts
function validHeader(
  signed: p.ISigned<p.IManifestHeader>,
  signer: IDeviceListState["devices"] extends ReadonlyMap<string, infer V> ? V | undefined : never,
  vaultId: Uint8Array,
  seq: bigint,
  previous: Uint8Array,
  at: IDeviceListState,
  previousEpoch: number,
) {
  const h = signed.body;

  return !(
    !signer ||
    !p.equal(h.vaultId, vaultId) ||
    h.seq !== seq ||
    !p.equal(h.prev, previous) ||
    !p.equal(h.listHead, at.head) ||
    h.epoch !== at.epoch ||
    h.epoch < previousEpoch ||
    !p.verifyObject(p.ManifestHeaderCodec, signed, signer.objPub, "manifest").ok
  );
}
```

## apps/cli/src/vault/history.ts :: anchoredState

PENDING

Ordered steps, including branches:

```ts
function anchoredState(entries: p.ISigned<p.TEntry>[], stored?: IDeviceListState) {
  if (!stored) return undefined;
  const anchor = entries.find((entry) => entry.body.seq === stored.seq);

  return anchor && p.equal(p.objectHash(p.EntryCodec, anchor, "entry"), stored.head)
    ? stored
    : undefined;
}
```

## apps/cli/src/vault/named.ts :: namedForList

PENDING

Ordered steps, including branches:

```ts
export function namedForList(device: p.IDeviceRecord, history: THistory) {
  const taken = [...history.state.devices.values()].map((member) => member.name);

  return { ...device, name: uniqueDeviceName(device.name, taken) };
}
```

## apps/cli/src/vault/setup.ts :: lockedsetupVault

PENDING

Ordered steps, including branches:

```ts
async function lockedsetupVault(
  adapters: TAdapters,
  options: {
    address: string;
    token: string;
    name: string;
    password: string;
    now: () => number;
    fetcher: TFetch;
    resumeSecretKey?: string;
    readResumeSecretKey?: () => Promise<string | undefined>;
    onKit?: (kit: ISetupKit) => Promise<void>;
  },
) {
  const existing = await loadState(adapters.home);

  if (existing?.vaultId && !existing.creationPending) {
    return { state: existing, kit: resumedKit(existing, options) };
  }

  const token = p.decodeToken("setup", options.token);
  await hello(options.address, token.serverPin, options.fetcher, MIN_SERVER);
  const identity = await deviceIdentity(adapters.keychain, adapters.home, options.name);

  const pending = await resumableCreation(adapters, existing, identity.record.id);

  if (pending) {
    const resumed = await resumeCreation(adapters, options, token, identity, pending);
    if (resumed) return resumed;
  }

  const material = await createGenesis(identity, token.serverPin, options.now());
  const state = emptyState(options.name);
  state.vaultId = p.base32(material.vaultId);
  state.server = { address: options.address, pin: text(token.serverPin), protocol: 1 };

  state.entries = [material.genesis, material.epoch].map((entry) =>
    text(p.encode(p.signedCodec(p.EntryCodec), entry)),
  );

  state.keyring = text(material.keyring);

  const client = createClient({
    address: options.address,
    pin: token.serverPin,
    vaultId: material.vaultId,
    identity,
    version: VERSION,
    now: options.now,
    fetcher: options.fetcher,
    proof: (request) => p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
  });

  try {
    const record = await registerPassword(client, material.vaultId, options.password);

    const creation = await createVaultSwap(
      material,
      identity,
      options.password,
      record,
      options.now(),
    );

    const bytes = p.encode(p.SwapCodec, creation.swap);
    state.creationPending = text(bytes);
    const kit = { ...creation.kit, server: options.address, masterPassword: BLANK_PASSWORD };

    await options.onKit?.(kit);

    state.headers = [text(p.encode(p.signedCodec(p.ManifestHeaderCodec), creation.swap.header))];
    state.files = text(p.encode(p.FilesCodec, creation.swap.files!));
    state.checkpoint = text(p.objectHash(p.ManifestHeaderCodec, creation.swap.header, "manifest"));
    await adapters.keychain.set(`envden/${adapters.home}/epoch/1`, material.epochKey);
    await adapters.keychain.set(`envden/${adapters.home}/id-key`, material.idKey);
    await saveState(adapters.home, state, adapters.now);
    await client.request("/v1/vault", "POST", bytes);
    delete state.creationPending;
    await recordUnlockWindow(client, state);
    await saveState(adapters.home, state, adapters.now);

    return {
      state,
      kit,
    };
  } finally {
    material.recoveryKeys.encSk.fill(0);
    material.recoveryKeys.objSk.fill(0);
  }
}
```

## apps/cli/src/vault/setup.ts :: setupVault

PENDING

Ordered steps, including branches:

```ts
export function setupVault(...args: Parameters<typeof lockedsetupVault>) {
  return withStateLock(args[0].home, () => lockedsetupVault(...args));
}
```

## apps/cli/src/vault/setup.ts :: resumableCreation

PENDING

Ordered steps, including branches:

```ts
async function resumableCreation(
  adapters: TAdapters,
  state: Awaited<ReturnType<typeof loadState>>,
  deviceId: Uint8Array,
) {
  if (!state?.creationPending || !state.vaultId || !state.server) return undefined;
  const epoch = await adapters.keychain.get(`envden/${adapters.home}/epoch/1`);
  const id = await adapters.keychain.get(`envden/${adapters.home}/id-key`);

  const valid =
    epoch && id && matchesPendingKey(state.creationPending, state.vaultId, epoch, deviceId);

  return valid
    ? {
        state,
        creationPending: state.creationPending,
        vaultId: state.vaultId,
        server: state.server,
      }
    : undefined;
}
```

## apps/cli/src/vault/setup.ts :: resumeCreation

PENDING

Ordered steps, including branches:

```ts
async function resumeCreation(
  adapters: TAdapters,
  options: Parameters<typeof lockedsetupVault>[1],
  token: ReturnType<typeof p.decodeToken>,
  identity: Awaited<ReturnType<typeof deviceIdentity>>,
  pending: NonNullable<Awaited<ReturnType<typeof resumableCreation>>>,
) {
  const resumeSecretKey = options.resumeSecretKey ?? (await options.readResumeSecretKey?.());

  const kit = resumeSecretKey
    ? resumedKit(pending.state, { ...options, resumeSecretKey })
    : undefined;

  const client = createClient({
    address: pending.server.address,
    pin: token.serverPin,
    vaultId: p.unbase32(pending.vaultId),
    identity,
    version: VERSION,
    now: options.now,
    fetcher: options.fetcher,
    proof: (request) => p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
  });

  try {
    await client.request(
      "/v1/vault",
      "POST",
      new Uint8Array(Buffer.from(pending.creationPending, "base64url")),
    );
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "UNAUTHORIZED") throw error;

    return undefined;
  }

  delete pending.state.creationPending;
  await recordUnlockWindow(client, pending.state);
  await saveState(adapters.home, pending.state, adapters.now);
  if (kit) return { state: pending.state, kit };

  return lostKitReplacement(adapters, options);
}
```

## apps/cli/src/vault/setup.ts :: matchesPendingKey

PENDING

Ordered steps, including branches:

```ts
function matchesPendingKey(
  encoded: string,
  vaultId: string,
  epoch: Uint8Array,
  deviceId: Uint8Array,
) {
  const swap = p.decode(p.SwapCodec, new Uint8Array(Buffer.from(encoded, "base64url")));
  const change = swap.entries.find((entry) => entry.body.kind === 3)?.body;

  return (
    p.equal(swap.header.body.signer, deviceId) &&
    change?.kind === 3 &&
    p.equal(p.keyCommit(epoch, p.unbase32(vaultId), 1), change.payload.change.keyCommit)
  );
}
```

## apps/cli/src/vault/creation.ts :: createVaultSwap

PENDING

Ordered steps, including branches:

```ts
export async function createVaultSwap(
  material: TGenesis,
  identity: TDeviceIdentity,
  password: string,
  registrationRecord: string,
  now: number,
) {
  const secret = p.randomBytes(16);

  const envelope = await p.sealEnvelope(
    {
      vaultId: material.vaultId,
      recoveryEncSk: material.recoveryKeys.encSk,
      recoveryObjSk: material.recoveryKeys.objSk,
      checkpoint: new Uint8Array(32),
      sealedAt: BigInt(now),
    },
    password,
    secret,
  );

  const files: p.IFiles = { entries: [] };

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      vaultId: material.vaultId,
      seq: 1n,
      op: 0,
      prev: new Uint8Array(32),
      listSeq: 1n,
      listHead: p.objectHash(p.EntryCodec, material.epoch, "entry"),
      epoch: 1,
      keyringHash: p.H("keyring-blob", material.keyring),
      filesHash: p.H("files", p.encode(p.FilesCodec, files)),
      envelopeHash: p.H("envelope-blob", envelope),
      createdAt: BigInt(now),
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "manifest",
  );

  const swap: p.ISwap = {
    expectedHead: new Uint8Array(32),
    entries: [material.genesis, material.epoch],
    header,
    files,
    keyring: material.keyring,
    envelope,
    skPub: p.skPub(secret, material.vaultId),
    opaqueRecord: new Uint8Array(Buffer.from(registrationRecord, "base64url")),
    approver: undefined,
  };

  return {
    swap,
    kit: { secretKey: p.encodeSecretKey(secret), vaultId: p.base32(material.vaultId) },
  };
}
```

## apps/cli/src/vault/add.ts :: addDeviceSwap

PENDING

Ordered steps, including branches:

```ts
export async function addDeviceSwap(
  history: THistory,
  device: p.IDeviceRecord,
  signer: Uint8Array,
  objSk: Uint8Array,
  epochKey: Uint8Array,
  op: 2 | 3,
  now: number,
  headerSigner: { id: Uint8Array; sk: Uint8Array },
): Promise<p.ISwap> {
  const before = history.headers.at(-1)!;
  const state = history.state;
  const wrap = await p.sealWrap(epochKey, state.vaultId, state.epoch, device.id, device.encPub);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: state.vaultId,
      seq: state.seq + 1n,
      parent: state.head,
      kind: 1,
      payload: { device, wrap },
      signer,
    },
    objSk,
    "entry",
  );

  if (applyEntry(state, entry).kind !== "valid")
    throw new EnvdenError("CONFLICT", "Device name or keys cannot be added");

  const expectedHead = p.objectHash(p.ManifestHeaderCodec, before, "manifest");

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...before.body,
      seq: before.body.seq + 1n,
      prev: expectedHead,
      op,
      listSeq: state.seq + 1n,
      listHead: p.objectHash(p.EntryCodec, entry, "entry"),
      createdAt: BigInt(now),
      signer: headerSigner.id,
    },
    headerSigner.sk,
    "manifest",
  );

  return {
    expectedHead,
    entries: [entry],
    header,
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
  };
}
```

## apps/cli/src/vault/join/validation.ts :: joinedHeader

PENDING

Ordered steps, including branches:

```ts
function joinedHeader(history: THistory, id: Uint8Array, pin: Uint8Array, hash: Uint8Array) {
  const header = history.headers.find((item) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), hash),
  );

  if (!header || !p.equal(history.state.serverPin, pin) || !history.state.devices.has(p.base32(id)))
    throw new EnvdenError("INVALID_DATA", "Pairing membership verification failed");

  return header;
}
```

## apps/cli/src/vault/join/validation.ts :: joinMembership

PENDING

Ordered steps, including branches:

```ts
export function joinMembership(
  history: THistory,
  id: Uint8Array,
  pin: Uint8Array,
  hash: Uint8Array,
) {
  const header = joinedHeader(history, id, pin, hash);
  const at = verifyChain(history.entries.filter((item) => item.body.seq <= header.body.listSeq));

  if (
    at.kind !== "valid" ||
    !p.equal(at.state.serverPin, pin) ||
    !at.state.devices.has(p.base32(id))
  )
    throw new EnvdenError("INVALID_DATA", "Device was not added at the approved checkpoint");

  return { header, at };
}
```

## apps/cli/src/vault/join/validation.ts :: requireLocalFloor

PENDING

Ordered steps, including branches:

```ts
export function requireLocalFloor(history: THistory, checkpoint: string | undefined) {
  if (
    checkpoint &&
    !history.headers.some((item) =>
      p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(checkpoint)),
    )
  )
    throw new EnvdenError("FORK", "Joined history does not descend from the local checkpoint");
}
```

## apps/cli/src/vault/join/validation.ts :: verifiedBlob

PENDING

Ordered steps, including branches:

```ts
export async function verifiedBlob(
  client: TClient,
  resource: "keyrings" | "files",
  label: "keyring-blob" | "files",
  hash: Uint8Array,
) {
  const bytes = new Uint8Array(
    await (await client.request(`/v1/${resource}/${text(hash)}`)).arrayBuffer(),
  );

  if (!p.equal(p.H(label, bytes), hash))
    throw new EnvdenError("INVALID_DATA", "Invalid join blob hash");

  return bytes;
}
```

## apps/cli/src/vault/join/validation.ts :: historyHasHeader

PENDING

Ordered steps, including branches:

```ts
export function historyHasHeader(history: THistory, hash: Uint8Array) {
  return history.headers.some((header) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), hash),
  );
}
```

## apps/cli/src/vault/join/advance.ts :: advanceCheckpoint

PENDING

Ordered steps, including branches:

```ts
export async function advanceCheckpoint(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  state: ILocalState,
  history: THistory,
) {
  const material = await checkpointMaterial(adapters, state);

  const context = {
    adapters,
    client,
    identity,
    state,
    skippedRoots: new Set<string>(),
    ...material,
    vaultId: material.checkpoint.header.body.vaultId,
    options: { now: () => 0, fetcher: adapters.fetcher },
  };

  await acceptHead(context, history);
  await persistCheckpoint(context);

  return state;
}
```

## apps/cli/src/vault/join/accept.ts :: lockedacceptJoin

PENDING

Ordered steps, including branches:

```ts
async function lockedacceptJoin(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  pin: Uint8Array,
  history: THistory,
  manifestHash: Uint8Array,
) {
  const { header, at } = joinMembership(history, identity.record.id, pin, manifestHash);

  const existing = await joinLocalState(adapters.home, p.base32(history.state.vaultId));

  const dropped = await droppedRejoin(adapters, history, existing?.checkpoint);

  if (existing?.checkpoint && !dropped) {
    await recordUnlockWindow(client, existing);

    return advanceCheckpoint(adapters, client, identity, existing, history);
  }

  const wrap = deviceWrap(history.entries, identity.record.id, header.body.listSeq);

  const commit = at.state.commits.get(header.body.epoch);
  if (!wrap || !commit) throw new EnvdenError("INVALID_DATA", "Missing device epoch wrap");

  const key = await p.openWrap(
    wrap,
    identity.keys.encSk,
    identity.record.encPub,
    history.state.vaultId,
    header.body.epoch,
    commit,
  );

  const box = await verifiedBlob(client, "keyrings", "keyring-blob", header.body.keyringHash);

  const ring = p.openKeyring(
    box,
    key,
    history.state.vaultId,
    header.body.epoch,
    at.state.commits,
    await knownIdKey(adapters, existing),
  );

  const files = await verifiedBlob(client, "files", "files", header.body.filesHash);

  p.decode(p.FilesCodec, files);
  const committed = at.state.devices.get(p.base32(identity.record.id))!;
  await adoptCommittedName(adapters.keychain, adapters.home, committed);

  const state = existing ?? emptyState(committed.name);
  state.deviceName = committed.name;
  state.verifiedState = at.state;
  state.vaultId = p.base32(history.state.vaultId);
  state.server = { address, pin: text(pin), protocol: 1 };
  state.checkpoint = text(manifestHash);

  state.headers = history.headers
    .filter((item) => item.body.seq <= header.body.seq)
    .map((item) => text(p.encode(p.signedCodec(p.ManifestHeaderCodec), item)));

  state.entries = history.entries
    .filter((item) => item.body.seq <= header.body.listSeq)
    .map((item) => text(p.encode(p.signedCodec(p.EntryCodec), item)));

  state.keyring = text(box);
  state.files = text(files);
  await recordUnlockWindow(client, state);
  await adapters.keychain.set(`envden/${adapters.home}/epoch/${header.body.epoch}`, key);
  await adapters.keychain.set(`envden/${adapters.home}/id-key`, ring.idKey);
  await saveState(adapters.home, state, adapters.now);

  return state;
}
```

## apps/cli/src/vault/join/accept.ts :: acceptJoin

PENDING

Ordered steps, including branches:

```ts
export function acceptJoin(...args: Parameters<typeof lockedacceptJoin>) {
  return withStateLock(args[0].home, () => lockedacceptJoin(...args));
}
```

## apps/cli/src/vault/join/accept.ts :: knownIdKey

PENDING

Ordered steps, including branches:

```ts
async function knownIdKey(adapters: TAdapters, state: Awaited<ReturnType<typeof loadState>>) {
  if (!state) return undefined;

  return (await adapters.keychain.get(`envden/${adapters.home}/id-key`)) ?? undefined;
}
```

## apps/cli/src/vault/join/floor.ts :: droppedRejoin

PENDING

Ordered steps, including branches:

```ts
export async function droppedRejoin(adapters: TAdapters, history: THistory, checkpoint?: string) {
  if (!checkpoint) return false;
  if (historyHasHeader(history, binary(checkpoint))) return false;
  const result = await checkRejoin(adapters, history);
  if (result?.kind === "dropped-by-repair") return true;
  requireLocalFloor(history, checkpoint);

  return false;
}
```

## apps/cli/src/vault/join/material.ts :: checkpointMaterial

PENDING

Ordered steps, including branches:

```ts
export async function checkpointMaterial(adapters: TAdapters, state: ILocalState) {
  if (!state.checkpoint || !state.files || !state.keyring || !state.vaultId)
    throw new EnvdenError("INVALID_DATA", "Missing checkpoint material");

  const vaultId = p.unbase32(state.vaultId);

  const headers = state.headers.map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const header = headers.find((item) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(state.checkpoint!)),
  );

  const entries = state.entries.map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), binary(value)),
  );

  if (!header) throw new EnvdenError("INVALID_DATA", "Missing checkpoint header");

  const chain =
    state.verifiedState?.seq === header.body.listSeq
      ? { kind: "valid" as const, state: state.verifiedState }
      : verifyChain(entries.filter((item) => item.body.seq <= header.body.listSeq));

  const idKey = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  const key = await adapters.keychain.get(`envden/${adapters.home}/epoch/${header.body.epoch}`);

  if (chain.kind !== "valid" || !idKey || !key)
    throw new EnvdenError("LOCKED", "Vault keys unavailable");

  const ring = p.openKeyring(
    binary(state.keyring),
    key,
    vaultId,
    header.body.epoch,
    chain.state.commits,
    idKey,
  );

  const keys = new Map(ring.older.map((item) => [item.epoch, item.key]));
  keys.set(header.body.epoch, key);

  return {
    headers,
    entries,
    keys,
    checkpoint: {
      header,
      files: p.decode(p.FilesCodec, binary(state.files)),
      state: chain.state,
      idKey,
    },
  };
}
```

## apps/cli/src/vault/join/local-state.ts :: joinLocalState

PENDING

Ordered steps, including branches:

```ts
export async function joinLocalState(home: string, vaultId: string) {
  const state = await loadState(home);
  if (!state?.vaultId) return undefined;
  if (state.vaultId === vaultId) return state;

  if (!state.creationPending)
    throw new EnvdenError("CONFLICT", "Device is already configured for another vault");

  return undefined;
}
```

## apps/cli/src/vault/initial/push.ts :: attemptPushInitialFiles

PENDING

Ordered steps, including branches:

```ts
async function attemptPushInitialFiles(
  adapters: TAdapters,
  state: ILocalState,
  now: () => number,
): Promise<void> {
  if (!state.links.length) return;

  if (!state.server || !state.vaultId)
    throw new EnvdenError("NOT_FOUND", "Vault is not configured");

  const { identity, vaultId, client } = await vaultConnection(
    adapters,
    { ...state, server: state.server, vaultId: state.vaultId },
    now,
    adapters.fetcher,
  );

  const history = await readHistory(client, vaultId);
  const previous = history.headers.at(-1)!;

  if (previous.body.seq !== 1n) {
    await resumeInitialFiles(adapters, now);

    return;
  }

  const key = await adapters.keychain.get(`envden/${adapters.home}/epoch/1`);
  const idKey = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  if (!key || !idKey) throw new EnvdenError("LOCKED", "Vault keys unavailable");

  const { files, bases } = await initialEntries(adapters, state, client, vaultId, key, idKey);

  if (!files.entries.length) return;
  files.entries.sort((a, b) => p.compare(a.fileId, b.fileId));
  const expectedHead = p.objectHash(p.ManifestHeaderCodec, previous, "manifest");

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...previous.body,
      seq: 2n,
      prev: expectedHead,
      op: 1,
      filesHash: p.H("files", p.FilesCodec.write(files)),
      createdAt: BigInt(now()),
    },
    identity.keys.objSk,
    "manifest",
  );

  const swap: p.ISwap = {
    expectedHead,
    header,
    entries: [],
    files,
    keyring: undefined,
    envelope: undefined,
    opaqueRecord: undefined,
    skPub: undefined,
    approver: undefined,
  };

  await client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  state.headers.push(text(p.signedCodec(p.ManifestHeaderCodec).write(header)));
  state.files = text(p.FilesCodec.write(files));
  state.checkpoint = text(p.objectHash(p.ManifestHeaderCodec, header, "manifest"));
  await saveState(adapters.home, state, adapters.now);

  await recordPushed(adapters.home, files, bases, adapters.now);
}
```

## apps/cli/src/vault/initial/push.ts :: pushInitialFiles

PENDING

Ordered steps, including branches:

```ts
export function pushInitialFiles(...args: Parameters<typeof attemptPushInitialFiles>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptPushInitialFiles(...args)));
}
```

## apps/cli/src/vault/initial/entries.ts :: initialEntries

PENDING

Ordered steps, including branches:

```ts
export async function initialEntries(
  adapters: TAdapters,
  state: ILocalState,
  client: TClient,
  vaultId: Uint8Array,
  key: Uint8Array,
  idKey: Uint8Array,
) {
  const files: p.IFiles = { entries: [] };
  const bases = new Map<string, Uint8Array>();

  for (const link of state.links) {
    if (link.localOnly) continue;
    const checkout = state.approved.find((item) => item.root === link.root);
    if (!checkout) throw new EnvdenError("UNAUTHORIZED", "Checkout approval required");
    const repoId = state.aliases[checkout.repoId] ?? checkout.repoId;
    const fileId = p.fileId(idKey, repoId, link.path);
    const content = new Uint8Array(await readFile(link.store));

    const notice = fileSizeNotice(link.path, content);

    if (notice) {
      console.error(notice);
      continue;
    }

    bases.set(
      basePath(adapters.home, link.store, link.mode === "copy" ? link.root : undefined),
      content,
    );

    if (files.entries.some((item) => p.equal(item.fileId, fileId))) continue;
    const context = { vaultId, epoch: 1, fileId, version: 1n };
    const name = { repoId, path: link.path };
    const blob = p.sealFile({ ...name, content }, key, context);
    const blobHash = p.H("blob", blob);
    await client.request(`/v1/blobs/${text(blobHash)}`, "PUT", blob);

    files.entries.push({
      fileId,
      version: 1n,
      epoch: 1,
      state: 1,
      blobHash,
      name: p.sealFileName(name, key, context),
    });
  }

  return { files, bases };
}
```

## apps/cli/src/vault/initial/record.ts :: recordPushed

PENDING

Ordered steps, including branches:

```ts
export async function recordPushed(
  home: string,
  files: p.IFiles,
  bases: Map<string, Uint8Array>,
  now: () => number,
) {
  const applied = await appliedFiles(home);

  for (const entry of files.entries)
    applied[p.base32(entry.fileId)] = text(p.FileEntryCodec.write(entry));

  await saveAppliedFiles(home, applied, now);
  for (const [path, bytes] of bases) await writeBytes(path, bytes, now);
}
```

## apps/cli/src/vault/initial/resume.ts :: resumeInitialFiles

PENDING

Ordered steps, including branches:

```ts
export async function resumeInitialFiles(adapters: TAdapters, now: () => number) {
  const context = await syncContext(adapters, { now, fetcher: adapters.fetcher });
  await acceptHead(context);
  const bases = new Map<string, Uint8Array>();
  const { checkpoint, keys, state, vaultId, client, identity } = context;

  if (!isInitialPush(checkpoint.header, identity.record.id)) return;

  for (const entry of checkpoint.files.entries) {
    if (entry.state !== 1) return;
    const key = keys.get(entry.epoch)!;
    const c = { vaultId, fileId: entry.fileId, epoch: entry.epoch, version: entry.version };
    const name = p.openFileName(entry.name, key, checkpoint.idKey, c);

    const links = matchingLinks(state, name);

    if (!links.length) return;

    const blob = new Uint8Array(
      await (await client.request(`/v1/blobs/${text(entry.blobHash)}`)).arrayBuffer(),
    );

    const file = p.openFile(blob, key, checkpoint.idKey, c, entry.blobHash, name);

    if (!(await recordMatchingBases(adapters.home, links, file.content, bases))) return;
  }

  await persistCheckpoint(context);
  await recordPushed(adapters.home, checkpoint.files, bases, adapters.now);
}
```

## apps/cli/src/vault/initial/resume.ts :: matchingLinks

PENDING

Ordered steps, including branches:

```ts
function matchingLinks(
  state: Awaited<ReturnType<typeof syncContext>>["state"],
  name: { path: string; repoId: string },
) {
  return state.links.filter(
    (link) =>
      !link.localOnly &&
      link.path === name.path &&
      state.approved.some(
        (checkout) =>
          checkout.root === link.root &&
          (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId,
      ),
  );
}
```

## apps/cli/src/vault/initial/resume.ts :: isInitialPush

PENDING

Ordered steps, including branches:

```ts
function isInitialPush(
  header: Awaited<ReturnType<typeof syncContext>>["checkpoint"]["header"],
  deviceId: Uint8Array,
) {
  return header.body.seq === 2n && header.body.op === 1 && p.equal(header.body.signer, deviceId);
}
```

## apps/cli/src/vault/initial/resume.ts :: recordMatchingBases

PENDING

Ordered steps, including branches:

```ts
async function recordMatchingBases(
  home: string,
  links: Awaited<ReturnType<typeof syncContext>>["state"]["links"],
  content: Uint8Array,
  bases: Map<string, Uint8Array>,
) {
  for (const link of links) {
    const local = await readBytes(link.mode === "copy" ? join(link.root, link.path) : link.store);
    if (!same(local, content)) return false;
    bases.set(basePath(home, link.store, link.mode === "copy" ? link.root : undefined), content);
  }

  return true;
}
```

## apps/cli/src/vault/recovery/read.ts :: readKit

PENDING

Ordered steps, including branches:

```ts
export async function readKit(path?: string, promptSecret = secret, promptInput = input) {
  if (path) return parseKit(await readKitFile(path));

  const secretKey = await promptSecret("Recovery secret key", secretKeyProblem);
  const vaultId = await promptInput("Vault ID", true, undefined, vaultIdProblem);

  return { secretKey: secretKey.trim(), vaultId: vaultId.trim() };
}
```

## apps/cli/src/vault/recovery/read.ts :: readKitFile

PENDING

Ordered steps, including branches:

```ts
async function readKitFile(path: string) {
  return readFile(path, "utf8").catch((cause: unknown) => {
    throw new EnvdenError("INVALID_INPUT", "Can't read the recovery kit file", { cause });
  });
}
```

## apps/cli/src/vault/recovery/output.ts :: writeKit

PENDING

Ordered steps, including branches:

```ts
export async function writeKit(path: string, kit: unknown) {
  const file = await open(path, "wx", 0o600).catch((cause: unknown) => {
    throw new EnvdenError(
      "INVALID_INPUT",
      "Cannot create recovery kit; choose a new --kit-out path in an existing directory",
      { cause },
    );
  });

  try {
    await restrictAccess(path);
    await file.writeFile(JSON.stringify(kit, null, 2));
  } finally {
    await file.close();
  }
}
```

## apps/cli/src/vault/recovery/input.ts :: decodes

PENDING

Ordered steps, including branches:

```ts
function decodes(decode: () => Uint8Array, length: number) {
  try {
    return decode().length === length;
  } catch {
    return false;
  }
}
```

## apps/cli/src/vault/recovery/input.ts :: secretKeyProblem

PENDING

Ordered steps, including branches:

```ts
export function secretKeyProblem(text: string) {
  return decodes(() => p.decodeSecretKey(text.trim()), 16)
    ? undefined
    : "Not a secret key. Copy the EK1-… line from your recovery kit";
}
```

## apps/cli/src/vault/recovery/input.ts :: vaultIdProblem

PENDING

Ordered steps, including branches:

```ts
export function vaultIdProblem(text: string) {
  return decodes(() => p.unbase32(text.trim()), 32)
    ? undefined
    : "Not a vault ID. Copy it from your recovery kit";
}
```

## apps/cli/src/vault/recovery/input.ts :: parseKit

PENDING

Ordered steps, including branches:

```ts
export function parseKit(text: string) {
  try {
    const kit = kitSchema.parse(JSON.parse(text));

    return { vaultId: kit.vaultId.trim(), secretKey: kit.secretKey.trim() };
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "Not a recovery kit file", { cause });
  }
}
```

## apps/cli/src/vault/recovery/key.ts :: recoveryEpochKey

PENDING

Ordered steps, including branches:

```ts
export async function recoveryEpochKey(
  history: THistory,
  envelope: Awaited<ReturnType<typeof p.openEnvelope>>,
  recoveryKeys: { encSk: Uint8Array },
  vaultId: Uint8Array,
) {
  const recovery = history.state.recovery;

  if (
    !envelope.checkpoint.every((byte) => byte === 0) &&
    !history.headers.some((header) =>
      p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), envelope.checkpoint),
    )
  )
    throw new EnvdenError("ROLLBACK", "Envelope checkpoint missing from history");

  const record = history.entries[0]!.body;
  if (record.kind !== 0) throw new EnvdenError("INVALID_DATA", "Missing genesis");
  let wrap: p.IWrap | undefined;

  for (const item of history.entries)
    if (item.body.kind === 2 || item.body.kind === 3 || item.body.kind === 4)
      wrap = item.body.payload.change.wraps.find((value) => p.equal(value.recipient, recovery.id));

  const commit = history.state.commits.get(history.state.epoch);
  if (!wrap || !commit) throw new EnvdenError("INVALID_DATA", "Missing recovery wrap");

  const epochKey = await p.openWrap(
    wrap,
    recoveryKeys.encSk,
    recovery.encPub,
    vaultId,
    history.state.epoch,
    commit,
  );

  return epochKey;
}
```

## apps/cli/src/vault/recovery/pending-kit.ts :: resumedKit

PENDING

Ordered steps, including branches:

```ts
export function resumedKit(
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  options: { address: string; resumeSecretKey?: string },
) {
  if (!options.resumeSecretKey)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Resume setup with the recovery kit issued before creation",
    );

  const vaultId = state.vaultId!;
  const secret = p.decodeSecretKey(options.resumeSecretKey);

  if (state.creationPending) {
    const swap = p.decode(
      p.SwapCodec,
      new Uint8Array(Buffer.from(state.creationPending, "base64url")),
    );

    if (!swap.skPub || !p.equal(p.skPub(secret, p.unbase32(vaultId)), swap.skPub))
      throw new EnvdenError("INVALID_INPUT", "Recovery kit does not match pending vault");
  }

  return {
    vaultId,
    secretKey: options.resumeSecretKey,
    server: options.address,
    masterPassword: BLANK_PASSWORD,
  };
}

// The kit printed before creation is lost, so the committed vault gets a new one straight away.
```

## apps/cli/src/vault/recovery/pending-kit.ts :: lostKitReplacement

PENDING

Ordered steps, including branches:

```ts
export async function lostKitReplacement(
  adapters: TAdapters,
  options: {
    password: string;
    now: () => number;
    fetcher: TFetch;
    onKit?: (kit: ISetupKit) => Promise<void>;
  },
) {
  const result = await replaceKit(
    adapters,
    options.password,
    options.now,
    async (kit) => options.onKit?.({ ...kit, masterPassword: BLANK_PASSWORD }),
    options.fetcher,
  ).catch((cause: unknown) => {
    throw new EnvdenError("RECOVERY_KIT_REQUIRED", LOST_KIT, { cause });
  });

  if (result.kind !== "replaced") throw new EnvdenError("RECOVERY_KIT_REQUIRED", LOST_KIT);

  return {
    state: (await loadState(adapters.home))!,
    kit: { ...result.kit, masterPassword: BLANK_PASSWORD },
  };
}
```

## apps/cli/src/vault/recovery/resume.ts :: resumeKitJoin

PENDING

Ordered steps, including branches:

```ts
export async function resumeKitJoin(
  adapters: TAdapters,
  options: IKitJoin,
  context: Awaited<ReturnType<typeof prepareKitJoin>>,
) {
  const { resuming, history, identity, client, server, pending } = context;
  if (!resuming || !history.state.devices.has(p.base32(identity.record.id))) return;

  {
    const own = history.headers.find(
      (h) => h.body.op === 3 && p.equal(h.body.signer, identity.record.id),
    );

    if (!own) throw new EnvdenError("INVALID_DATA", "Missing kit join checkpoint");
    if (options.rejoin) await adoptRejoin(adapters, history);

    const accepted = await acceptJoin(
      adapters,
      client,
      identity,
      options.address,
      server.pin,
      history,
      p.objectHash(p.ManifestHeaderCodec, own, "manifest"),
    );

    if (options.rejoin) await finishRejoinIdentity(adapters);
    await rm(pending, { force: true });

    return accepted;
  }
}
```

## apps/cli/src/vault/recovery/kit.ts :: attemptKitJoin

PENDING

Ordered steps, including branches:

```ts
async function attemptKitJoin(adapters: TAdapters, options: IKitJoin) {
  const context = await prepareKitJoin(adapters, options);
  const resumed = await resumeKitJoin(adapters, options, context);
  if (resumed) return resumed;
  const { vaultId, server, pending, identity, client, history } = context;
  const secret = p.decodeSecretKey(options.secretKey);

  const head = history.headers.at(-1)!;
  const box = new Uint8Array(await (await client.request("/v1/envelope")).arrayBuffer());

  if (!p.equal(p.H("envelope-blob", box), head.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");

  const envelope = await p
    .openEnvelope(box, options.password, secret, vaultId)
    .catch((cause: unknown) => {
      if (cause instanceof EnvdenError) throw cause;

      throw new EnvdenError("INVALID_DATA", "Invalid recovery envelope", { cause });
    });

  secret.fill(0);
  const recoveryKeys = { encSk: envelope.recoveryEncSk, objSk: envelope.recoveryObjSk };

  try {
    const recovery = history.state.recovery;
    const epochKey = await recoveryEpochKey(history, envelope, recoveryKeys, vaultId);

    const swap = await addDeviceSwap(
      history,
      namedForList(identity.record, history),
      recovery.id,
      recoveryKeys.objSk,
      epochKey,
      3,
      options.now(),
      { id: identity.record.id, sk: identity.keys.objSk },
    );

    if (!p.verifyObject(p.EntryCodec, swap.entries[0]!, recovery.objPub, "entry").ok)
      throw new EnvdenError("INVALID_DATA", "Recovery key is no longer current");

    await client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
    const updated = await readHistory(client, vaultId);

    if (options.rejoin) await adoptRejoin(adapters, updated);

    const accepted = await acceptJoin(
      adapters,
      client,
      identity,
      options.address,
      server.pin,
      updated,
      p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"),
    );

    if (options.rejoin) await finishRejoinIdentity(adapters);

    await rm(pending, { force: true });

    return accepted;
  } finally {
    recoveryKeys.encSk.fill(0);
    recoveryKeys.objSk.fill(0);
  }
}
```

## apps/cli/src/vault/recovery/kit.ts :: lockedkitJoin

PENDING

Ordered steps, including branches:

```ts
function lockedkitJoin(...args: Parameters<typeof attemptKitJoin>) {
  return retryHead(() => attemptKitJoin(...args));
}
```

## apps/cli/src/vault/recovery/kit.ts :: kitJoin

PENDING

Ordered steps, including branches:

```ts
export function kitJoin(...args: Parameters<typeof lockedkitJoin>) {
  return withStateLock(args[0].home, () => lockedkitJoin(...args));
}
```

## apps/cli/src/vault/recovery/attempt.ts :: prepareKitJoin

PENDING

Ordered steps, including branches:

```ts
export async function prepareKitJoin(adapters: TAdapters, options: IKitJoin) {
  await joinLocalState(adapters.home, options.vaultId);
  const vaultId = p.unbase32(options.vaultId);
  const server = await hello(options.address, undefined, options.fetcher, MIN_SERVER);

  const pending = join(adapters.home, "state", "kit-join");

  const attempt = JSON.stringify({
    vaultId: options.vaultId,
    pin: p.base32(server.pin),
    name: options.name,
  });

  const resuming = (await optionalRead(pending)) === attempt;

  const identity = options.rejoin
    ? await rejoinIdentity(adapters, options.name)
    : await deviceIdentity(
        adapters.keychain,
        adapters.home,
        options.name,
        !resuming && !(await loadState(adapters.home))?.checkpoint,
      );

  await atomicWrite(pending, attempt, adapters.now);

  const client = createClient({
    address: options.address,
    pin: server.pin,
    vaultId,
    identity,
    version: VERSION,
    now: options.now,
    fetcher: options.fetcher,
  });

  if (resuming) {
    try {
      await login(client, vaultId, options.password);
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "NOT_MEMBER") throw error;
      await login(client, vaultId, options.password, "kit");
    }
  } else await login(client, vaultId, options.password, "kit");

  const history = await readHistory(client, vaultId);

  if (!p.equal(history.state.serverPin, server.pin))
    throw new EnvdenError("MOVING", "Vault moved; use its current server address");

  if (options.rejoin) await checkRejoin(adapters, history);

  return { vaultId, server, pending, resuming, identity, client, history };
}
```

## apps/cli/src/vault/files/retained.ts :: retainedList

PENDING

Ordered steps, including branches:

```ts
export async function retainedList(client: TClient, filesHash: Uint8Array) {
  const bytes = await optionalObject(client, `/v1/files/${text(filesHash)}`);
  if (!bytes) return undefined;

  if (!p.equal(p.H("files", bytes), filesHash))
    throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

  return p.decode(p.FilesCodec, bytes);
}
```

## apps/cli/src/vault/files/retained.ts :: retainedBlob

PENDING

Ordered steps, including branches:

```ts
export function retainedBlob(client: TClient, blobHash: Uint8Array) {
  return optionalObject(client, `/v1/blobs/${text(blobHash)}`);
}
```

## apps/cli/src/vault/files/retained.ts :: openedName

PENDING

Ordered steps, including branches:

```ts
export function openedName(
  entry: p.IFileEntry,
  keys: ReadonlyMap<number, Uint8Array>,
  idKey: Uint8Array,
  vaultId: Uint8Array,
) {
  const key = keys.get(entry.epoch);
  if (!key) return undefined;

  try {
    return p.openFileName(entry.name, key, idKey, { ...entry, vaultId });
  } catch {
    return undefined;
  }
}
```

## apps/cli/src/vault/keys/wrap.ts :: deviceWrap

PENDING

Ordered steps, including branches:

```ts
export function deviceWrap(
  entries: p.ISigned<p.TEntry>[],
  recipient: Uint8Array,
  through?: bigint,
) {
  let wrap: p.IWrap | undefined;

  for (const { body: entry } of entries) {
    if (through !== undefined && entry.seq > through) break;
    if (entry.kind === 1 && p.equal(entry.payload.device.id, recipient)) wrap = entry.payload.wrap;

    if (entry.kind === 2 || entry.kind === 3 || entry.kind === 4)
      wrap = entry.payload.change.wraps.find((item) => p.equal(item.recipient, recipient));
  }

  return wrap;
}
```

## apps/cli/src/vault/recovery/pdf/report.ts :: reportKit

PENDING

Ordered steps, including branches:

```ts
export async function reportKit(kit: IReplacementKit, report: IKitReport) {
  const path = await saveKit(kit, report).catch(() => undefined);

  if (!path) {
    console.error("envden: Couldn't write the recovery kit file; save the kit printed below");
    printKit(kit);

    // keep the kit on screen until it's saved, instead of scrolling it away with the next questions
    while (process.stdin.isTTY && !(await consent("Saved the recovery kit?", false)));

    return;
  }

  printKitSaved(homePath(path, report.userHome), "pdf");

  if (process.stdin.isTTY && (await consent("Open it now?", true)) && !(await openBrowser(path)))
    console.error("envden: Couldn't open the kit; open the file above yourself");
}
```

## apps/cli/src/vault/recovery/pdf/report.ts :: saveKit

PENDING

Ordered steps, including branches:

```ts
async function saveKit(kit: IReplacementKit, report: IKitReport) {
  const bytes = await renderKit(kitDocument(kit, new Date(report.now), report.deviceName));

  return writeKitPdf(await kitFolder(report.userHome), kit.vaultId, bytes);
}
```

## apps/cli/src/vault/recovery/pdf/name.ts :: kitFileName

PENDING

Ordered steps, including branches:

```ts
export function kitFileName(vaultId: string, copy: number): string {
  const base = `envden Recovery Kit ${vaultId.slice(0, 6)}`;

  return copy === 1 ? `${base}.pdf` : `${base} (${copy}).pdf`;
}
```

## apps/cli/src/vault/recovery/pdf/model.ts :: kitDocument

PENDING

Ordered steps, including branches:

```ts
export function kitDocument(kit: IReplacementKit, date: Date, deviceName: string): IKitDocument {
  return {
    title: "envden Recovery Kit",
    details: [
      { label: "Created", value: localTime(date.getTime()) },
      { label: "Device", value: deviceName },
    ],
    fields: [
      { label: "Vault ID", value: kit.vaultId },
      { label: "Secret key", value: kit.secretKey, large: true },
      { label: "Server", value: kit.server },
    ],
    instructions: [
      `To get back in on a new device: run envden join ${kit.server} --recovery, enter the vault ID and secret key above, then your master password.`,
      "Keep this offline, like a passport. Never write your master password on it.",
      "Anyone with this kit and your master password can open the vault.",
    ],
    footer: SITE_URL,
  };
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: renderKit

PENDING

Ordered steps, including branches:

```ts
export async function renderKit(document: IKitDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(document.title);

  const page = pdf.addPage(PageSizes.A4);

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    code: await pdf.embedFont(StandardFonts.Courier),
  };

  const pen = { page, fonts };
  let y = page.getHeight() - MARGIN;

  y = drawHeader(pen, document, y);
  y = drawFields(pen, document, y - 28);
  drawInstructions(pen, document, y - 28);
  drawFooter(pen, document);

  // Without object streams older PDF readers can open the file too.
  return pdf.save({ useObjectStreams: false });
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: drawHeader

PENDING

Ordered steps, including branches:

```ts
function drawHeader({ page, fonts }: IPen, document: IKitDocument, top: number) {
  let y = top - 24;
  write(page, document.title, MARGIN, y, fonts.bold, 24);

  y -= 10;

  for (const detail of document.details) {
    y -= 15;
    write(page, detail.label, MARGIN, y, fonts.bold, 10, MUTED);
    write(page, detail.value, MARGIN + 56, y, fonts.regular, 10);
  }

  return y;
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: drawFields

PENDING

Ordered steps, including branches:

```ts
function drawFields({ page, fonts }: IPen, document: IKitDocument, top: number) {
  const width = page.getWidth() - MARGIN * 2;
  const inner = width - PADDING * 2;

  const rows = document.fields.map((field) => ({
    ...field,
    size: fitSize(field.value, fonts.code, field.large ? 18 : 12, inner),
  }));

  const height = PADDING * 2 + rows.reduce((sum, row) => sum + 9 + 8 + row.size, 0) + 18 * 2;

  page.drawRectangle({
    x: MARGIN,
    y: top - height,
    width,
    height,
    borderColor: RULE,
    borderWidth: 1,
  });

  let y = top - PADDING;

  for (const row of rows) {
    y -= 9;
    write(page, row.label.toUpperCase(), MARGIN + PADDING, y, fonts.bold, 9, MUTED);

    y -= 8 + row.size;
    write(page, row.value, MARGIN + PADDING, y, fonts.code, row.size);

    y -= 18;
  }

  return top - height;
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: drawInstructions

PENDING

Ordered steps, including branches:

```ts
function drawInstructions({ page, fonts }: IPen, document: IKitDocument, top: number) {
  const width = page.getWidth() - MARGIN * 2;
  let y = top;

  for (const paragraph of document.instructions) {
    const text = printable(paragraph, fonts.regular);
    const measure = (part: string) => fonts.regular.widthOfTextAtSize(part, 11);

    for (const line of breakTextIntoLines(text, [" "], width, measure)) {
      y -= 16;
      write(page, line.trim(), MARGIN, y, fonts.regular, 11);
    }

    y -= 8;
  }
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: drawFooter

PENDING

Ordered steps, including branches:

```ts
function drawFooter({ page, fonts }: IPen, document: IKitDocument) {
  const width = fonts.regular.widthOfTextAtSize(document.footer, 9);
  write(page, document.footer, (page.getWidth() - width) / 2, MARGIN, fonts.regular, 9, MUTED);
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: write

PENDING

Ordered steps, including branches:

```ts
function write(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  page.drawText(printable(text, font), { x, y, font, size, color });
}
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: fitSize

PENDING

Ordered steps, including branches:

```ts
function fitSize(text: string, font: PDFFont, preferred: number, width: number) {
  return Math.min(preferred, width / Math.max(font.widthOfTextAtSize(text, 1), 1));
}

// Standard fonts only cover WinAnsi; anything else (emoji, CJK, controls) would make pdf-lib throw.
```

## apps/cli/src/vault/recovery/pdf/layout.ts :: printable

PENDING

Ordered steps, including branches:

```ts
function printable(text: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());

  return text.replace(/./gsu, (char) => (supported.has(char.codePointAt(0)!) ? char : "?"));
}
```

## apps/cli/src/vault/recovery/pdf/folder.ts :: kitFolder

PENDING

Ordered steps, including branches:

```ts
export async function kitFolder(userHome: string): Promise<string> {
  const downloads = join(userHome, "Downloads");
  const found = await stat(downloads).catch(() => undefined);

  return found?.isDirectory() ? downloads : userHome;
}
```

## apps/cli/src/vault/recovery/pdf/save.ts :: writeKitPdf

PENDING

Ordered steps, including branches:

```ts
export async function writeKitPdf(
  folder: string,
  vaultId: string,
  bytes: Uint8Array,
): Promise<string> {
  for (let copy = 1; ; copy++) {
    const path = join(folder, kitFileName(vaultId, copy));
    const file = await open(path, "wx", 0o600).catch(skipExisting);
    if (!file) continue;

    try {
      await restrictAccess(path);
      await file.writeFile(bytes);
      await file.close();
    } catch (cause) {
      // A half-written kit is worse than none; the caller prints the kit instead.
      await file.close().catch(() => undefined);
      await rm(path, { force: true });

      throw cause;
    }

    return path;
  }
}
```

## apps/cli/src/vault/recovery/pdf/save.ts :: skipExisting

PENDING

Ordered steps, including branches:

```ts
function skipExisting(cause: unknown) {
  if ((cause as NodeJS.ErrnoException).code === "EEXIST") return undefined;

  throw cause;
}
```

## apps/cli/src/notice/offers.ts :: cacheOffers

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function cacheOffers(
  adapters: TAdapters,
  state: ILocalState,
  cwd: string | undefined,
  update: { available: boolean; required: boolean },
  now = 0,
) {
  const path = join(adapters.home, "state", "track-offers");
  const roots = new Set(((await optionalRead(path)) ?? "").split("\n").filter(safeRoot));

  if (cwd) await scanOffer(adapters, state, cwd, roots, now);

  const pending = [...roots].filter((root) => !state.approved.some((item) => item.root === root));
  await atomicWrite(path, pending.join("\n") + (pending.length ? "\n" : ""), adapters.now);
  const lines = [];
  if (update.available) lines.push("envden: update available; run envden update");
  if (update.required) lines.push("envden: update required; run envden update");

  await atomicWrite(
    join(adapters.home, "state", "notice-update"),
    lines.join("\n") + (lines.length ? "\n" : ""),
    adapters.now,
  );
}
```

## apps/cli/src/notice/offers.ts :: safeRoot

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function safeRoot(root: string) {
  return !!root && sanitizeTerminal(root) === root && !/[\r\n]/.test(root);
}
```

## apps/cli/src/notice/offers.ts :: scanOffer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function scanOffer(
  adapters: TAdapters,
  state: ILocalState,
  cwd: string,
  roots: Set<string>,
  now: number,
) {
  const checkout = await adapters.repo.checkoutAt(cwd).catch(() => undefined);
  if (!checkout || !safeRoot(checkout.root) || roots.has(checkout.root)) return;
  if (state.approved.some((item) => item.root === checkout.root)) return;
  const path = join(adapters.home, "state", "track-scanned.json");
  const scans = await recentScans(path, now);
  const previous = scans[checkout.root];
  if (previous !== undefined && now - previous < millisecondsInMinute) return;

  const files = await adapters.repo.envFiles(
    checkout,
    (await readConfig(adapters.home))["env-files"],
  );

  if (files.length) roots.add(checkout.root);
  scans[checkout.root] = now;
  await atomicWrite(path, JSON.stringify(scans), adapters.now);
}
```

## apps/cli/src/notice/offers.ts :: recentScans

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function recentScans(path: string, now: number): Promise<Record<string, number>> {
  const saved = scansSchema.safeParse(JSON.parse((await optionalRead(path)) ?? "{}")).data ?? {};

  const scans: Record<string, number> = Object.fromEntries(
    Object.entries(saved)
      .filter((entry) => now - entry[1] < millisecondsInMinute)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 255),
  );

  return scans;
}
```

## apps/cli/src/notice/pending.ts :: pendingJoins

PENDING

Ordered steps, including branches:

```ts
async function pendingJoins(home: string): Promise<Record<string, string>> {
  const pending = await optionalRead(join(home, "state", "pending-recovery.json"));
  if (!pending) return {};

  try {
    const value: unknown = JSON.parse(pending);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    if (Object.values(value).some((name) => typeof name !== "string")) return {};

    return Object.fromEntries(Object.entries(value));
  } catch {
    return {};
  }
}
```

## apps/cli/src/notice/pending.ts :: addPendingJoins

PENDING

Ordered steps, including branches:

```ts
export async function addPendingJoins(
  home: string,
  entries: string[],
  ownId: Uint8Array,
  now: () => number,
) {
  const pending = await pendingJoins(home);

  const seen = new Set<string>(
    JSON.parse((await optionalRead(join(home, "state", "recovery-notice"))) ?? "[]"),
  );

  for (const [id, name] of Object.entries(recoveryJoins(entries, ownId))) {
    if (!seen.has(id)) pending[id] = name;
  }

  await atomicWrite(join(home, "state", "pending-recovery.json"), JSON.stringify(pending), now);
}
```

## apps/cli/src/notice/pending.ts :: reportPendingJoins

PENDING

Ordered steps, including branches:

```ts
export async function reportPendingJoins(home: string, now: () => number) {
  const pending = await pendingJoins(home);
  await printRecoveryJoins(home, pending, now);
  await atomicWrite(join(home, "state", "pending-recovery.json"), "{}", now);
}
```

## apps/cli/src/notice/cache.ts :: noticeStatus

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function noticeStatus(home: string, state: ILocalState) {
  const repos = new Set<string>();

  for (const link of state.links) {
    if (link.localOnly) continue;

    const base = await readBytes(
      basePath(home, link.store, link.mode === "copy" ? link.root : undefined),
    );

    const local = await readBytes(link.mode === "link" ? link.store : join(link.root, link.path));

    if (!same(base, local)) {
      const checkout = state.approved.find((item) => item.root === link.root);
      if (checkout) repos.add(state.aliases[checkout.repoId] ?? checkout.repoId);
    }
  }

  return [...repos].map((repoId) => ({ repoId, status: "local changes" }));
}
```

## apps/cli/src/notice/cache.ts :: lockedrefreshNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedrefreshNotice(
  home: string,
  state: ILocalState,
  caseInsensitive: (root: string) => Promise<boolean>,
  now: () => number,
): Promise<void> {
  const roots = state.approved
    .map((item) => item.root)
    .filter((root) => sanitizeTerminal(root) === root && !/[\r\n]/.test(root));

  await atomicWrite(join(home, "state", "approved-checkouts"), roots.join("\n") + "\n", now);

  const insensitive = await Promise.all(
    roots.map(async (root) =>
      (await caseInsensitive(root).catch(() => false)) ? root : undefined,
    ),
  );

  await atomicWrite(
    join(home, "state", "approved-checkouts-insensitive"),
    insensitive.filter((root) => root !== undefined).join("\n") + "\n",
    now,
  );

  const local = await noticeStatus(home, state);
  const remote = await readRemoteNotice(home);
  const repos = [...new Set([...local.map((item) => item.repoId), ...(remote?.repos ?? [])])];

  await atomicWrite(
    join(home, "state", "notice"),
    repos.map((repoId) => `envden: ${sanitizeTerminal(repoId)} out of sync`).join("\n") +
      (repos.length ? "\n" : ""),
    now,
  );
}
```

## apps/cli/src/notice/cache.ts :: cachedNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function cachedNotice(home: string): Promise<string> {
  return ((await optionalRead(join(home, "state", "notice"))) ?? "")
    .split("\n")
    .map(sanitizeTerminal)
    .join("\n");
}
```

## apps/cli/src/notice/cache.ts :: refreshNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function refreshNotice(...args: Parameters<typeof lockedrefreshNotice>) {
  return withStateLock(args[0], () => lockedrefreshNotice(...args));
}
```

## apps/cli/src/notice/remote.ts :: remoteNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function remoteNotice(adapters: TAdapters, options: ISyncOptions) {
  const context = await syncContext(adapters, options);
  await acceptHead(context, undefined, true);
  const result = await pendingRepos(context);

  await withStateLock(adapters.home, async () => {
    await writeRemoteNotice(
      adapters.home,
      { checkedAt: result.checkedAt, repos: result.repos },
      adapters.now,
    );

    await addPendingJoins(
      adapters.home,
      context.entries.map((entry) => text(p.signedCodec(p.EntryCodec).write(entry))),
      context.identity.record.id,
      adapters.now,
    );
  });

  return result;
}
```

## apps/cli/src/notice/remote.ts :: settleRemoteNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function settleRemoteNotice(context: TSyncContext) {
  const result = await pendingRepos(context);

  await withStateLock(context.adapters.home, () =>
    writeRemoteNotice(
      context.adapters.home,
      { checkedAt: result.checkedAt, repos: result.repos },
      context.options.now,
    ),
  );
}
```

## apps/cli/src/notice/remote.ts :: pendingRepos

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function pendingRepos(context: TSyncContext) {
  const applied = await appliedFiles(context.adapters.home);
  const rules = (await readConfig(context.adapters.home))["env-files"];

  const approved = new Set(
    context.state.approved.map((item) => context.state.aliases[item.repoId] ?? item.repoId),
  );

  const files: { repoId: string; path: string }[] = [];

  for (const entry of readableEntries(context)) {
    if (applied[p.base32(entry.fileId)] === text(p.FileEntryCodec.write(entry))) continue;
    const name = entryName(context, entry);

    if (
      approved.has(name.repoId) &&
      acceptsEnvPath(name.path, rules) &&
      receivesFile(context.state, name)
    )
      files.push({ repoId: name.repoId, path: name.path });
  }

  const repos = [...new Set(files.map((file) => file.repoId))];

  return { checkedAt: context.options.now(), repos, files };
}
```

## apps/cli/src/notice/remote.ts :: writeRemoteNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function writeRemoteNotice(home: string, notice: TRemoteNotice, now: () => number) {
  return atomicWrite(join(home, "state", "remote-notice.json"), JSON.stringify(notice), now);
}
```

## apps/cli/src/notice/remote.ts :: readRemoteNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function readRemoteNotice(home: string): Promise<TRemoteNotice | undefined> {
  const value = await optionalRead(join(home, "state", "remote-notice.json"));

  try {
    return remoteNoticeSchema.safeParse(value ? JSON.parse(value) : undefined).data;
  } catch {
    return undefined;
  }
}
```

## apps/cli/src/notice/recovery.ts :: recoveryJoins

PENDING

Ordered steps, including branches:

```ts
export function recoveryJoins(values: string[], ownId?: Uint8Array) {
  const signed = values.map((value) => p.decode(p.signedCodec(p.EntryCodec), binary(value)));
  const entries = signed.map((entry) => entry.body);
  const names = currentNames(entries);
  const notices: Record<string, string> = {};

  const ownJoin =
    entries.find(
      (entry) =>
        (entry.kind === 0 || entry.kind === 1) &&
        ownId !== undefined &&
        p.equal(entry.payload.device.id, ownId),
    )?.seq ?? -1n;

  let recovery: Uint8Array | undefined;

  for (const event of signed) {
    const entry = event.body;

    if (entry.kind === 1 && recovery && p.equal(entry.signer, recovery) && entry.seq > ownJoin)
      notices[text(p.objectHash(p.EntryCodec, event, "entry"))] = names.get(
        p.base32(entry.payload.device.id),
      )!;

    recovery = nextRecovery(recovery, entry);
  }

  return notices;
}
```

## apps/cli/src/notice/recovery.ts :: currentNames

PENDING

Ordered steps, including branches:

```ts
function currentNames(entries: p.TEntry[]) {
  const names = new Map<string, string>();

  for (const entry of entries) {
    if (entry.kind === 0 || entry.kind === 1)
      names.set(p.base32(entry.payload.device.id), entry.payload.device.name);
    else if (entry.kind === 7) names.set(p.base32(entry.payload.device), entry.payload.name);
  }

  return names;
}
```

## apps/cli/src/notice/recovery.ts :: nextRecovery

PENDING

Ordered steps, including branches:

```ts
function nextRecovery(current: Uint8Array | undefined, entry: p.TEntry) {
  if (entry.kind === 0 || entry.kind === 4) return entry.payload.recovery.id;
  if (entry.kind === 2 && entry.payload.newRecovery) return entry.payload.newRecovery.id;

  return current;
}
```

## apps/cli/src/notice/recovery.ts :: printRecoveryJoins

PENDING

Ordered steps, including branches:

```ts
export async function printRecoveryJoins(
  home: string,
  notices: Record<string, string>,
  now: () => number,
) {
  const path = join(home, "state", "recovery-notice");
  const seen = new Set<string>(JSON.parse((await optionalRead(path)) ?? "[]"));

  for (const [id, name] of Object.entries(notices)) {
    if (seen.has(id)) continue;
    console.error(`envden: ${sanitizeTerminal(name)} joined with the recovery kit`);
    seen.add(id);
  }

  await atomicWrite(path, JSON.stringify([...seen]), now);
}
```

## apps/cli/src/notice/recovery.ts :: reportRecoveryJoins

PENDING

Ordered steps, including branches:

```ts
export async function reportRecoveryJoins(
  home: string,
  state: ILocalState,
  ownId: Uint8Array | undefined,
  now: () => number,
) {
  await printRecoveryJoins(home, recoveryJoins(state.entries, ownId), now);
}
```

## apps/cli/src/notice/command.ts :: lockedcommandNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockedcommandNotice(
  adapters: TAdapters,
  now: number,
  refresh = false,
  cwd?: string,
) {
  await cleanupOldBinary(process.execPath, process.platform === "win32");
  const state = await loadState(adapters.home);
  if (!state) return { repos: [], update: await updateStatus(adapters.home) };

  if (!refresh) await reportPendingJoins(adapters.home, adapters.now);
  const remote = await readRemoteNotice(adapters.home);

  await refreshNotice(
    adapters.home,
    state,
    (root) => adapters.repo.caseInsensitive(root, true),
    adapters.now,
  );

  const update = await updateStatus(adapters.home);
  await cacheOffers(adapters, state, cwd, update, now);
  const local = await noticeStatus(adapters.home, state);

  const currentRepo = currentRepoId(state, cwd);

  return {
    repos: [...new Set([...local.map((item) => item.repoId), ...(remote?.repos ?? [])])]
      .filter((repo) => repo !== currentRepo)
      .map(sanitizeTerminal),
    update,
  };
}
```

## apps/cli/src/notice/command.ts :: commandNotice

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function commandNotice(
  adapters: TAdapters,
  now: number,
  fetcher: TFetch,
  refresh = false,
  cwd?: string,
  localOnly = false,
) {
  const fetchNotice = boundedFetch(fetcher);

  try {
    if (!refresh) {
      await withStateLock(adapters.home, () => reportPendingJoins(adapters.home, adapters.now));
    }

    if (!localOnly) {
      const state = await loadState(adapters.home);
      if (state) await refreshedRemote(adapters, state, now, fetchNotice, !refresh);
    }

    if (!refresh && !localOnly) await runUpdateCheck(adapters, now, false, fetcher);

    return await withStateLock(adapters.home, () =>
      lockedcommandNotice(adapters, now, refresh, cwd),
    );
  } catch {
    return { repos: [], update: { available: false, required: false } };
  }
}
```

## apps/cli/src/notice/command.ts :: refreshedRemote

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function refreshedRemote(
  adapters: TAdapters,
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  now: number,
  fetcher: TFetch,
  force: boolean,
) {
  let remote = await readRemoteNotice(adapters.home);

  if (state.checkpoint && (force || !remote || now - remote.checkedAt >= millisecondsInMinute)) {
    try {
      remote = await remoteNotice(adapters, { now: () => now, fetcher, all: true });
    } catch {
      remote = undefined;
    }
  }

  return remote;
}
```

## apps/cli/src/notice/command.ts :: currentRepoId

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function currentRepoId(state: NonNullable<Awaited<ReturnType<typeof loadState>>>, cwd?: string) {
  const current = cwd
    ? state.approved.find(
        (item) => resolve(cwd) === item.root || resolve(cwd).startsWith(item.root + sep),
      )
    : undefined;

  const currentRepo = current && (state.aliases[current.repoId] ?? current.repoId);

  return currentRepo;
}
```

## apps/cli/src/notice/fetch.ts :: boundedFetch

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function boundedFetch(
  fetcher: TFetch,
  deadline = AbortSignal.timeout(milliseconds({ seconds: 2 })),
): TFetch {
  return async (input, init) => {
    const signal = init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
    signal.throwIfAborted();
    let abort = () => {};

    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });

    try {
      return await Promise.race([fetcher(input, { ...init, signal }), cancelled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
}
```

## apps/cli/src/report/launch.ts :: launchHarness

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function launchHarness(command: string[]): Promise<void> {
  // The agent owns the terminal now, so Ctrl-C is its to handle.
  const ignore = () => {};
  process.on("SIGINT", ignore);

  try {
    // oxlint-disable-next-line envden/trusted-process -- The user picked their own coding agent, so it runs from their PATH with their environment.
    await Bun.spawn(command, {
      stdio: ["inherit", "inherit", "inherit"],
      env: process.env,
      cwd: process.cwd(),
    }).exited;
  } finally {
    process.off("SIGINT", ignore);
  }
}
```

## apps/cli/src/report/write.ts :: writeReport

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function writeReport(
  home: string,
  document: string,
  now: () => number,
): Promise<string> {
  const directory = join(home, "reports");
  await privateDirectory(directory);

  const path = join(directory, `${new Date(now()).toISOString().replace(/[:.]/g, "-")}.md`);
  await atomicWrite(path, document, now);

  return path;
}
```

## apps/cli/src/report/offer.ts :: deriveReportOffer

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function deriveReportOffer(input: IReportOfferInput): boolean {
  const { error, command, interactive, env } = input;

  if (!interactive || env.ENVDEN_NO_REPORT === "1") return false;

  if (AGENT_VARIABLES.some((name) => env[name])) return false;

  if (error instanceof PromptCancelled) return false;

  if (!isEnvdenError(error)) return true;

  if (error.code === "CONFLICT" && command && SYNC_COMMANDS.has(command)) return false;

  return !USERS_TO_FIX[error.code];
}
```

## apps/cli/src/report/harness.ts :: detectHarnesses

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function detectHarnesses(which: (command: string) => string | null): IHarness[] {
  return HARNESSES.flatMap((harness) => {
    const path = which(harness.id);

    return path ? [{ id: harness.id, name: harness.name, path }] : [];
  });
}
```

## apps/cli/src/report/harness.ts :: launchCommand

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function launchCommand(harness: IHarness, prompt: string): string[] {
  const promptArgs = HARNESSES.find((entry) => entry.id === harness.id)!.promptArgs;

  return [harness.path, ...promptArgs(prompt)];
}
```

## apps/cli/src/report/run.ts :: systemEffects

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function systemEffects(): IReportEffects {
  return {
    env: process.env,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    argv: process.argv.slice(2),
    which: (command) => Bun.which(command),
    choose,
    launch: launchHarness,
    open: openBrowser,
    print: (line) => console.error(line),
  };
}

// Never throws: a failed report must not hide or change the original error.
```

## apps/cli/src/report/run.ts :: reportProblem

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function reportProblem(
  error: unknown,
  adapters: Pick<TAdapters, "home" | "userHome" | "now">,
  effects: IReportEffects = systemEffects(),
): Promise<void> {
  try {
    const command = effects.argv.find((arg) => !arg.startsWith("-"));
    const offer = { error, command, interactive: effects.interactive, env: effects.env };
    if (!deriveReportOffer(offer)) return;

    const harnesses = detectHarnesses(effects.which);

    const choice = await effects.choose(
      "This looks like an envden bug. Report it?",
      [
        ...harnesses.map((harness) => ({
          value: harness.id,
          label: `Ask ${harness.name} to look into it and draft a GitHub issue`,
        })),
        { value: "browser", label: "Open a pre-filled GitHub issue in the browser" },
        { value: "no", label: "No" },
      ],
      "no",
    );

    if (choice === "no") return;

    const facts = await reportFacts(adapters.home, adapters.userHome, error, effects.argv);
    const document = reportDocument(facts);
    const path = await writeReport(adapters.home, document, adapters.now);
    effects.print(`Report saved to ${homePath(path, adapters.userHome)}`);

    const harness = harnesses.find((entry) => entry.id === choice);
    const logs = facts.files.filter((file) => file.exists).map((file) => file.path);

    if (harness) return await effects.launch(launchCommand(harness, agentPrompt(path, logs)));

    if (!(await effects.open(issueUrl(issueTitle(facts.args, facts.failure.code), document))))
      effects.print(`Couldn't open a browser. Open ${NEW_ISSUE_URL} and paste the report.`);
  } catch (failure) {
    if (!(failure instanceof PromptCancelled)) effects.print("Couldn't prepare the report.");
  }
}
```

## apps/cli/src/report/facts.ts :: exists

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}
```

## apps/cli/src/report/facts.ts :: logTail

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function logTail(path: string): Promise<string | undefined> {
  const stat = await lstat(path).catch(() => undefined);
  if (!stat?.isFile()) return undefined;

  // Bun returns nothing for a negative slice longer than the file.
  return Bun.file(path)
    .slice(Math.max(0, stat.size - LOG_BYTES))
    .text();
}
```

## apps/cli/src/report/facts.ts :: installLabel

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function installLabel(home: string): Promise<string> {
  return installMethod(home).then(
    (method) => (method.kind === "script" ? "script" : method.command[0]!),
    () => "unknown",
  );
}
```

## apps/cli/src/report/facts.ts :: relevantFiles

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function relevantFiles(home: string, userHome: string) {
  const paths = [
    join(home, "server.log"),
    `${join(home, "state")}${sep}`,
    join(home, "config.json"),
    serviceFile(process.platform, userHome, home),
  ].filter((path) => path !== undefined);

  return Promise.all(paths.map(async (path) => ({ path, exists: await exists(path) })));
}
```

## apps/cli/src/report/facts.ts :: reportFacts

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function reportFacts(
  home: string,
  userHome: string,
  error: unknown,
  argv: readonly string[],
) {
  return {
    version: VERSION,
    os: `${process.platform} ${release()}`,
    arch: process.arch,
    install: await installLabel(home),
    args: maskArguments(argv),
    failure: describeFailure(error),
    serverLog: await logTail(join(home, "server.log")),
    files: await relevantFiles(home, userHome),
    userHome,
  };
}
```

## apps/cli/src/report/content/issue.ts :: url

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function url(title: string, body: string): string {
  return `${NEW_ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
```

## apps/cli/src/report/content/issue.ts :: issueTitle

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function issueTitle(args: readonly string[], code: string): string {
  const command = args.find((arg) => /^[a-z][a-z-]*$/.test(arg));

  return `envden ${command ?? ""} fails with ${code}`.replace(/\s+/g, " ");
}
```

## apps/cli/src/report/content/issue.ts :: wellFormed

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function wellFormed(text: string): string {
  return text.replace(/\p{Cs}/gu, "\uFFFD");
}
```

## apps/cli/src/report/content/issue.ts :: prefix

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function prefix(text: string, length: number): string {
  return wellFormed(text.slice(0, length));
}
```

## apps/cli/src/report/content/issue.ts :: issueUrl

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function issueUrl(title: string, report: string): string {
  const body = wellFormed(report);
  if (url(title, body).length <= MAX_URL) return url(title, body);

  const budget = MAX_URL - url(title, TRUNCATED).length;
  let [low, high] = [0, body.length];

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (encodeURIComponent(prefix(body, middle)).length <= budget) low = middle;
    else high = middle - 1;
  }

  return url(title, prefix(body, low) + TRUNCATED);
}
```

## apps/cli/src/report/content/prompt.ts :: agentPrompt

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function agentPrompt(report: string, logs: readonly string[]): string {
  return [
    `envden just failed with what looks like a bug in envden itself. envden is open source: https://github.com/${REPOSITORY}`,
    "",
    `A redacted report is at ${report}.`,
    ...(logs.length ? [`You may also read: ${logs.join(", ")}.`] : []),
    "",
    "1. Read the report and logs and work out the likely cause. Read envden's source if it helps.",
    "2. Don't open key files or env files. Never copy env file contents, keys, tokens, passwords or recovery kit values into the issue.",
    "3. Draft a short GitHub issue: title, what happened, steps to reproduce, envden version and OS, likely cause.",
    `4. Show me the draft. Only after I agree, create it with \`gh issue create --repo ${REPOSITORY}\`. If gh isn't installed or signed in, give me the text and this link: ${NEW_ISSUE_URL}`,
  ].join("\n");
}
```

## apps/cli/src/report/content/document.ts :: fenced

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function fenced(text: string): string {
  return ["~~~", text.trimEnd(), "~~~"].join("\n");
}
```

## apps/cli/src/report/content/document.ts :: errorSection

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function errorSection(failure: IFailure): string[] {
  return [
    "## Error",
    "",
    `- Code: ${failure.code}`,
    `- Message: ${failure.message}`,
    ...failure.causes.map((cause) => `- Caused by: ${cause}`),
    ...(failure.stack ? ["", fenced(failure.stack)] : []),
  ];
}
```

## apps/cli/src/report/content/document.ts :: logSection

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function logSection(serverLog: string | undefined): string[] {
  const tail = serverLog?.trimEnd().split("\n").slice(-LOG_LINES).join("\n");

  return [`## Server log (last ${LOG_LINES} lines)`, "", tail ? fenced(tail) : "No server log."];
}
```

## apps/cli/src/report/content/document.ts :: withHome

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function withHome(text: string, userHome: string): string {
  return userHome.length > 1 ? text.replaceAll(userHome, "~") : text;
}
```

## apps/cli/src/report/content/document.ts :: reportDocument

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function reportDocument(facts: IReportFacts): string {
  const document = [
    "# envden problem report",
    "",
    `- Version: ${facts.version}`,
    `- OS: ${facts.os} (${facts.arch})`,
    `- Install method: ${facts.install}`,
    `- Command: envden ${facts.args.join(" ")}`,
    "",
    ...errorSection(facts.failure),
    "",
    ...logSection(facts.serverLog),
    "",
    "## Other files",
    "",
    "Paths only; contents are not included.",
    "",
    ...facts.files.map((file) => `- ${file.path}${file.exists ? "" : " (missing)"}`),
    "",
  ].join("\n");

  return redactSecrets(withHome(document, facts.userHome));
}
```

## apps/cli/src/report/content/redact.ts :: maskRun

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function maskRun(run: string): string {
  if (isToken("setup", run)) return "[setup token]";

  return isToken("repair", run) ? "[repair token]" : "[redacted]";
}
```

## apps/cli/src/report/content/redact.ts :: redactSecrets

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function redactSecrets(text: string): string {
  return text
    .replace(SECRET_KEY, "EK1-[redacted]")
    .replace(BASE32_RUN, maskRun)
    .replace(ENV_LINE, "$1[redacted]")
    .replace(ASSIGNMENT, "$1=[redacted]");
}
```

## apps/cli/src/report/content/failure.ts :: messageOf

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
```

## apps/cli/src/report/content/failure.ts :: causeChain

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function causeChain(error: unknown): string[] {
  const causes: string[] = [];
  let cause = error instanceof Error ? error.cause : undefined;

  while (cause !== undefined && causes.length < CAUSE_DEPTH) {
    causes.push(messageOf(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }

  return causes;
}
```

## apps/cli/src/report/content/failure.ts :: describeFailure

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function describeFailure(error: unknown): IFailure {
  const failure = {
    code: isEnvdenError(error) ? error.code : error instanceof Error ? error.name : typeof error,
    message: messageOf(error),
    causes: causeChain(error),
  };

  return !isEnvdenError(error) && error instanceof Error && error.stack
    ? { ...failure, stack: error.stack }
    : failure;
}
```

## apps/cli/src/report/content/arguments.ts :: maskArguments

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function maskArguments(args: readonly string[]): string[] {
  const masked: string[] = [];

  for (const [index, arg] of args.entries()) {
    const [flag, value] = arg.split(/=(.*)/s);

    if (PASSWORD_FLAG.test(flag!))
      return [
        ...masked,
        value === undefined ? arg : `${flag}=${MASK}`,
        ...args.slice(index + 1).map(() => MASK),
      ];

    if (SECRET_FLAGS.has(flag!) && value !== undefined) masked.push(`${flag}=${MASK}`);
    else if (SECRET_FLAGS.has(args[index - 1] ?? "")) masked.push(MASK);
    else masked.push(arg);
  }

  return masked;
}
```

## apps/cli/src/agent/install.ts :: installAgent

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function installAgent(userHome: string, now: () => number): Promise<void> {
  const target = join(userHome, ".agents", "skills", "envden");
  const link = join(userHome, ".claude", "skills", "envden");
  const file = join(target, "SKILL.md");

  if (!ownSkill(await readFile(file, "utf8").catch(missing)))
    throw new EnvdenError("CONFLICT", "~/.agents/skills/envden already holds a different skill");

  await writeThrough(file, skill, now);
  await mkdir(dirname(link), { recursive: true });

  // Codex reads ~/.agents/skills itself; ~/.claude/skills often links to that same folder
  if (!(await lstat(link).catch(missing)))
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  else if ((await realpath(link).catch(missing)) !== (await realpath(target)))
    throw new EnvdenError("CONFLICT", "~/.claude/skills/envden already holds a different skill");
}
```

## apps/cli/src/agent/install.ts :: ownSkill

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function ownSkill(text: string | undefined) {
  return text === undefined || /^name: envden$/m.test(text.split("\n---")[0] ?? "");
}
```

## apps/cli/src/agent/install.ts :: missing

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
```

## apps/cli/src/agent/write-through.ts :: writeThrough

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function writeThrough(
  path: string,
  bytes: string | Uint8Array,
  now: () => number,
): Promise<void> {
  await atomicWrite(await linkTarget(path), bytes, now);
}
```

## apps/cli/src/agent/write-through.ts :: linkTarget

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function linkTarget(path: string): Promise<string> {
  let current = resolve(path);

  for (let hops = 0; hops < MAX_LINKS; hops++) {
    const real = await realpath(current).catch(missing);

    if (real !== undefined) return real;

    const stat = await lstat(current).catch(missing);

    if (!stat?.isSymbolicLink()) {
      await mkdir(dirname(current), { recursive: true });

      return join(await realpath(dirname(current)), basename(current));
    }

    current = resolve(dirname(current), await readlink(current));
  }

  throw new EnvdenError("INVALID_INPUT", "Too many symbolic links");
}
```

## apps/cli/src/agent/write-through.ts :: missing

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
```

## apps/cli/src/agent/shell.ts :: manageShell

PENDING

Ordered steps, including branches:

```ts
export async function manageShell(
  adapters: TAdapters,
  action: "install" | "uninstall",
  shell: TShell | "none",
) {
  if (shell === "none") return;

  const adapter = adapters.shell(shell);

  if (action === "install") await adapter.install(adapters.executable);
  else await adapter.uninstall();
}
```

## apps/cli/src/agent/service/installed.ts :: installedServicePort

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function installedServicePort(platform: string, userHome: string, home: string) {
  const path = serviceFile(platform, userHome, home);
  const bytes = path ? await readFile(path).catch(() => undefined) : undefined;

  return bytes && installedPort(serviceText(bytes, platform));
}

// Windows task definitions are written as UTF-16LE, without a byte order mark
```

## apps/cli/src/agent/service/installed.ts :: serviceText

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function serviceText(bytes: Buffer, platform: string) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");

  return bytes.toString(platform === "win32" ? "utf16le" : "utf8");
}
```

## apps/cli/src/agent/service/install.ts :: installHostService

PENDING

Ordered steps, including branches:

```ts
export async function installHostService(
  options: {
    platform: string;
    executable: string;
    userHome: string;
    home: string;
    port: number;
    uid: number;
    write: typeof writeThrough;
    run: (args: string[]) => Promise<void>;
    pause: (ms: number) => Promise<void>;
  },
  now: () => number,
) {
  const log = join(options.home, "server.log");

  const definition = serviceDefinition(
    options.platform,
    options.executable,
    join(options.home, "server"),
    log,
    options.port,
  );

  const path = serviceFile(options.platform, options.userHome, options.home)!;

  if (definition.kind === "launchd") {
    await options.write(path, definition.content, now);

    await options
      .run(["launchctl", "bootout", `gui/${options.uid}/com.envden.server`])
      .catch(() => {});

    await bootstrap(
      () => options.run(["launchctl", "bootstrap", `gui/${options.uid}`, path]),
      options.pause,
    );
  } else if (definition.kind === "systemd") {
    await options.write(path, definition.content, now);
    await options.run(["systemctl", "--user", "daemon-reload"]);
    await options.run(["systemctl", "--user", "enable", "envden.service"]);
    await options.run(["systemctl", "--user", "restart", "envden.service"]);
  } else {
    await options.write(path, new Uint8Array(Buffer.from(definition.content, "utf16le")), now);
    await options.run(["schtasks", "/End", "/TN", "envden"]).catch(() => {});
    await options.run(["schtasks", "/Create", "/TN", "envden", "/XML", path, "/F"]);
    await options.run(["schtasks", "/Run", "/TN", "envden"]);
  }

  return { log, path };
}

// bootout returns while launchd is still tearing the old job down, so the first bootstrap can fail
```

## apps/cli/src/agent/service/install.ts :: bootstrap

PENDING

Ordered steps, including branches:

```ts
async function bootstrap(load: () => Promise<void>, pause: (ms: number) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= BOOTSTRAP_ATTEMPTS) throw error;
      await pause(BOOTSTRAP_PAUSE_MS);
    }
  }
}

const BOOTSTRAP_ATTEMPTS = 10;
const BOOTSTRAP_PAUSE_MS = 300;
```

## apps/cli/src/agent/service/install.ts :: runServiceCommand

PENDING

Ordered steps, including branches:

```ts
export async function runServiceCommand(args: string[]) {
  const child = spawnTrusted(args[0]!, args.slice(1), { stdout: "ignore", stderr: "pipe" });
  const [stderr, result] = await Promise.all([new Response(child.stderr).text(), child.exited]);

  if (result !== 0)
    throw new EnvdenError(
      "INTERNAL",
      `Could not start the envden server service: ${stderr.trim().slice(0, 300) || `${args[0]} exited ${result}`}`,
    );
}
```

## apps/cli/src/agent/service/location.ts :: serviceFile

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function serviceFile(platform: string, userHome: string, home: string) {
  if (platform === "darwin")
    return join(userHome, "Library", "LaunchAgents", "com.envden.server.plist");

  if (platform === "linux") return join(userHome, ".config", "systemd", "user", "envden.service");

  return platform === "win32" ? join(home, "envden-task.xml") : undefined;
}
```

## apps/cli/src/agent/service/generate.ts :: xml

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll(">", "&gt;");
}
```

## apps/cli/src/agent/service/generate.ts :: unitPath

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function unitPath(value: string) {
  if (/[\r\n\0]/.test(value)) throw new EnvdenError("INVALID_INPUT", "Invalid service path");

  return value.replaceAll("%", "%%");
}
```

## apps/cli/src/agent/service/generate.ts :: unit

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function unit(value: string) {
  return '"' + unitPath(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
}

// in the order Task Scheduler exports them; its defaults skip battery power and stop after 72 hours
const TASK_SETTINGS = [
  "<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
  "<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>",
  "<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>",
  "<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>",
  "<RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>",
].join("");
```

## apps/cli/src/agent/service/generate.ts :: serviceDefinition

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function serviceDefinition(
  platform: string,
  executable: string,
  home: string,
  log: string,
  port: number,
) {
  const args = [executable, "serve", "--data-dir", home, "--port", String(port)];

  if (platform === "darwin")
    return {
      kind: "launchd" as const,
      content: `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>com.envden.server</string><key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join("")}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string></dict></plist>`,
    };

  if (platform === "linux")
    return {
      kind: "systemd" as const,
      content: `[Unit]\nDescription=envden server\n[Service]\nExecStart=${args.map(unit).join(" ")}\nRestart=on-failure\nStandardOutput=append:${unitPath(log)}\nStandardError=append:${unitPath(log)}\n[Install]\nWantedBy=default.target\n`,
    };

  if (platform === "win32") {
    const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const script = `& ${quote(executable)} serve --data-dir ${quote(home)} --port ${port} *> ${quote(log)}`;

    return {
      kind: "task" as const,
      content: `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers><Settings>${TASK_SETTINGS}</Settings><Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>-NoProfile -NonInteractive -Command ${xml(script)}</Arguments></Exec></Actions></Task>`,
    };
  }

  throw new EnvdenError("NOT_IMPLEMENTED", "Login services are unsupported on this platform");
}
```

## apps/cli/src/agent/service/port.ts :: chooseServerPort

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function chooseServerPort(probe: IPortProbe, preferred = DEFAULT_SERVER_PORT) {
  if ((await probe.free(preferred)) || (await probe.envden(preferred))) return preferred;

  return probe.anyFree();
}

// the service definition is the record of which port a hosted server uses
```

## apps/cli/src/agent/service/port.ts :: installedPort

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function installedPort(definition: string): number | undefined {
  const match = /--port(?:<\/string><string>|"? "?|\s+)(\d{1,5})/.exec(definition);
  const port = match ? Number(match[1]) : NaN;

  return port >= 1 && port <= 65535 ? port : undefined;
}

export const systemPortProbe: IPortProbe = {
  free: async (port) => {
    try {
      await Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() }).stop(true);

      return true;
    } catch {
      return false;
    }
  },
  envden: async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      signal: AbortSignal.timeout(1000),
    }).catch(() => undefined);

    const body = (await response?.json().catch(() => undefined)) as { mode?: unknown } | undefined;

    return typeof body?.mode === "string";
  },
  anyFree: async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = server.port!;
    await server.stop(true);

    return port;
  },
};
```

## apps/cli/src/diagnostics/doctor.ts :: doctor

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function doctor(adapters: TAdapters, location: ReturnType<typeof paths>) {
  await ensurePaths(location.home);
  const directory = await mkdtemp(join(location.state, "doctor-"));
  let symlinks = false;

  try {
    await writeFile(join(directory, "target"), "", { mode: 0o600 });
    await symlink(join(directory, "target"), join(directory, "link"));
    symlinks = true;
  } catch {
    symlinks = false;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const shells = await Promise.all(
    (["zsh", "bash", "fish", "powershell"] as const).map(async (shell) => {
      const adapter = adapters.shell(shell);

      return { shell, path: adapter.rcPath(), installed: await adapter.installed() };
    }),
  );

  return {
    keys: {
      location: homePath(adapters.home, await realHome(adapters.userHome)),
      ownerOnly: await adapters.keychain.ownerOnly(),
    },
    symlinks,
    update: await updateStatus(adapters.home),
    tailscale: await adapters.network.status(),
    https: await adapters.network.checkHttpsCertificate(),
    shells,
  };
}
```

## apps/cli/src/identity/device.ts :: lockeddeviceIdentity

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function lockeddeviceIdentity(
  keychain: IKeychainAdapter,
  namespace: string,
  name: string,
  fresh = false,
) {
  const slot = `envden/${namespace}/device`;
  const stored = await keychain.get(slot);

  if (stored && !fresh) {
    return readIdentity(stored);
  }

  const state = await loadState(namespace);

  if (state?.verifiedState || (state?.vaultId && !state.creationPending))
    throw new EnvdenError("LOCKED", "Vault keys unavailable");

  const keys = generateDeviceKeys();

  const record = {
    id: deviceId(keys),
    name,
    encPub: keys.encPub,
    objPub: keys.objPub,
    reqPub: keys.reqPub,
  };

  await keychain.set(slot, identityBytes(keys, record));

  return { keys: { encSk: keys.encSk, objSk: keys.objSk, reqSk: keys.reqSk }, record };
}

export type TDeviceIdentity = Awaited<ReturnType<typeof deviceIdentity>>;
```

## apps/cli/src/identity/device.ts :: deviceIdentity

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function deviceIdentity(...args: Parameters<typeof lockeddeviceIdentity>) {
  return withStateLock(args[1], () => lockeddeviceIdentity(...args));
}
```

## apps/cli/src/identity/rename.ts :: adoptCommittedName

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function adoptCommittedName(
  keychain: IKeychainAdapter,
  home: string,
  committed: IDeviceRecord,
) {
  for (const slot of [`envden/${home}/rejoin/device`, `envden/${home}/device`]) {
    const stored = await keychain.get(slot);
    if (!stored) continue;

    const identity = readIdentity(stored);

    if (!equal(identity.record.id, committed.id) || identity.record.name === committed.name)
      continue;

    await keychain.set(
      slot,
      identityBytes(identity.keys, { ...identity.record, name: committed.name }),
    );
  }
}
```

## apps/cli/src/identity/stored.ts :: identityBytes

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function identityBytes(keys: ISecretKeys, record: IDeviceRecord) {
  return concat(keys.encSk, keys.objSk, keys.reqSk, encode(DeviceRecordCodec, record));
}
```

## apps/cli/src/identity/stored.ts :: readIdentity

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function readIdentity(stored: Uint8Array) {
  if (stored.length < 96) throw new EnvdenError("INVALID_DATA", "Invalid device identity");

  const keys = {
    encSk: stored.slice(0, 32),
    objSk: stored.slice(32, 64),
    reqSk: stored.slice(64, 96),
  };

  const record = decode(DeviceRecordCodec, stored.slice(96));
  const seeds = [keys.encSk, keys.objSk, keys.reqSk];
  let cursor = 0;
  const derived = generateDeviceKeys(() => seeds[cursor++]!);

  if (
    !equal(derived.encPub, record.encPub) ||
    !equal(derived.objPub, record.objPub) ||
    !equal(derived.reqPub, record.reqPub)
  )
    throw new EnvdenError("INVALID_DATA", "Device keys do not match their public record");

  if (!equal(deviceId(record), record.id))
    throw new EnvdenError("INVALID_DATA", "Invalid device identity");

  return { keys: { encSk: keys.encSk, objSk: keys.objSk, reqSk: keys.reqSk }, record };
}
```

## apps/cli/src/identity/name/suggested.ts :: suggestedDeviceName

PENDING

Ordered steps, including branches:

```ts
export function suggestedDeviceName(hostname: string) {
  const host = hostname.replace(/[\p{Cc}\p{Cf}]/gu, "").split(".")[0]!;
  const name = fitDeviceName(host.trim()).trim();

  return name || "device";
}
```

## apps/cli/src/identity/name/unique.ts :: uniqueDeviceName

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function uniqueDeviceName(name: string, taken: Iterable<string>) {
  const names = new Set(taken);
  if (!names.has(name)) return name;

  for (let number = 2; ; number++) {
    const suffix = `-${number}`;
    const candidate = fitDeviceName(name, suffix.length) + suffix;

    if (!names.has(candidate)) return candidate;
  }
}
```

## apps/cli/src/identity/name/fit.ts :: fitDeviceName

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function fitDeviceName(name: string, reserved = 0) {
  let fitted = "";
  let bytes = 0;

  for (const character of name) {
    bytes += encoder.encode(character).length;
    if (bytes > MAX_BYTES - reserved) break;
    fitted += character;
  }

  return fitted;
}
```

## apps/cli/src/client/history.ts :: decodeHistoryObject

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function decodeHistoryObject<T>(
  received: Uint8Array,
  codec: p.ICodec<T>,
  label: "entry" | "manifest",
  state: IDeviceListState,
  stored: readonly Uint8Array[] = [],
  latestVersion = VERSION,
) {
  const result = decodeServerObject({
    received,
    codec,
    label,
    members:
      label === "entry" ? [...state.devices.values(), state.recovery] : [...state.devices.values()],
    stored: stored.find((raw) => p.equal(raw.subarray(34, 42), received.subarray(34, 42))),
    mismatch: "fork",
    currentVersion: VERSION,
    latestVersion,
  });

  if (result.kind === "known") return result.value;
  if (result.kind === "fork") throw new EnvdenError("FORK", "Server history forked");
  if (result.kind === "rollback") throw new EnvdenError("ROLLBACK", "Server history rolled back");

  if (result.kind === "update-required")
    throw new EnvdenError("UPDATE_REQUIRED", "Update envden to read server data");

  throw new EnvdenError(
    "INVALID_DATA",
    result.kind === "unreadable" ? "Unreadable data from server" : "Invalid data from server",
  );
}
```

## apps/cli/src/client/history.ts :: decodeHistoryEntries

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function decodeHistoryEntries(
  raw: readonly Uint8Array[],
  stored: readonly Uint8Array[] = [],
  latestVersion = VERSION,
  initial?: IDeviceListState,
) {
  const entries: p.ISigned<p.TEntry>[] = [];
  let state = initial;
  const states = new Map<bigint, IDeviceListState>();
  if (state) states.set(state.seq, state);

  for (const bytes of raw) {
    const entry = state
      ? decodeHistoryObject(bytes, p.EntryCodec, "entry", state, stored, latestVersion)
      : decodeUntrusted(p.signedCodec(p.EntryCodec), bytes);

    const result = applyEntry(state, entry);
    if (result.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid device list");
    state = result.state;
    states.set(state.seq, state);
    entries.push(entry);
  }

  if (!state) throw new EnvdenError("INVALID_DATA", "Missing device list");

  return { entries, state, states };
}
```

## apps/cli/src/client/history.ts :: decodeHistoryHeader

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function decodeHistoryHeader(
  raw: Uint8Array,
  entries: readonly p.ISigned<p.TEntry>[],
  stored: readonly Uint8Array[] = [],
  latestVersion = VERSION,
  states?: ReadonlyMap<bigint, IDeviceListState>,
) {
  const seq =
    raw[0] === 2 && raw[1] === 1
      ? p.u64.read(new p.Reader(raw.subarray(75, 83)))
      : (entries.at(-1)?.body.seq ?? 0n);

  const cached = states?.get(seq);

  const at = cached
    ? { kind: "valid" as const, state: cached }
    : verifyChain(entries.filter((entry) => entry.body.seq <= seq));

  if (at.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid device list");

  return decodeHistoryObject(
    raw,
    p.ManifestHeaderCodec,
    "manifest",
    at.state,
    stored,
    latestVersion,
  );
}
```

## apps/cli/src/client/errors.ts :: serverErrorMessage

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function serverErrorMessage(code: TErrorCode, path: string): string {
  if (path.startsWith("/v1/pairing/") && pairingGone.includes(code))
    return "Pairing code expired or already used. Run envden device add for a new one";

  if (path.startsWith("/v1/opaque/login/") && code === "UNAUTHORIZED")
    return "Login expired or the vault moved. Check the server address and try again";

  return messages[code];
}
```

## apps/cli/src/client/errors.ts :: responseError

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function responseError(response: Response, path = ""): Promise<EnvdenError> {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (data && typeof data === "object" && "kind" in data && data.kind === "head-moved")
    return new EnvdenError("HEAD_MOVED", messages.HEAD_MOVED);

  const parsed = ErrorResponseSchema.safeParse(data);

  if (parsed.success)
    return new EnvdenError(parsed.data.error, serverErrorMessage(parsed.data.error, path));

  return new EnvdenError("INVALID_DATA", "Invalid server response");
}
```

## apps/cli/src/client/retry.ts :: retryHead

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function retryHead<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "HEAD_MOVED" || attempt === 2)
        throw error;
    }
  }

  throw new EnvdenError("HEAD_MOVED", "Head kept moving; retry the command");
}
```

## apps/cli/src/client/retry.ts :: retryBusy

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function retryBusy<T>(run: () => Promise<T>, wait = backoff): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "BUSY" || attempt === 2) throw error;
      await wait(100 * (attempt + 1));
    }
  }
}
```

## apps/cli/src/client/retry.ts :: backoff

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function backoff(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

## apps/cli/src/client/request.ts :: createClient

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function createClient(options: IClientOptions): IClient {
  async function signedRequest(
    path: string,
    method = "GET",
    body?: unknown,
    retry = true,
  ): Promise<Response> {
    const serialized = serializeRequestBody(body);

    const url = new URL(path, options.address);

    if (url.origin !== new URL(options.address).origin)
      throw new EnvdenError("INVALID_INPUT", "Invalid request destination");

    await memberHello(options.address, options.pin, options.fetcher);

    const value: p.IRequest = {
      serverPin: options.pin,
      vaultId: options.vaultId,
      method,
      pathAndQuery: url.pathname + url.search,
      bodyHash: p.sha256(
        typeof serialized === "string" ? new TextEncoder().encode(serialized) : serialized,
      ),
      time: BigInt(options.now()),
      nonce: p.randomBytes(16),
      device: options.identity.record.id,
      clientVersion: options.version,
    };

    const headers = new Headers({
      "Content-Type": "application/json",
      "Envden-Request": text(p.encode(p.RequestCodec, value)),
      "Envden-Device": text(value.device),
      "Envden-Body-Hash": text(value.bodyHash),
      "Envden-Time": String(value.time),
      "Envden-Nonce": text(value.nonce),
      "Envden-Signature": text(p.signRequest(value, options.identity.keys.reqSk).signature),
      "Envden-Device-Record": text(p.encode(p.DeviceRecordCodec, options.identity.record)),
    });

    if (options.proof) headers.set("Envden-Proof", text(options.proof(value)));

    const response = await serverFetch(options.fetcher, url, {
      method,
      headers,
      ...(serialized ? { body: serialized } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(milliseconds({ seconds: 15 })),
    });

    await checkServerMinimum(response, options);

    if (!response.ok) {
      const error = await responseError(response, url.pathname);

      if (error.code === "LOCKED" && retry && options.unlock) {
        await options.unlock();

        return signedRequest(path, method, body, false);
      }

      throw error;
    }

    await authenticatedRequestSucceeded();

    return response;
  }

  const request: IClient["request"] = (path, method, body, retry) =>
    retryBusy(() => signedRequest(path, method, body, retry), options.backoff);

  const rpc = hc<AppType>(options.address, {
    fetch: async (input: string | Request | URL, init?: RequestInit) => {
      const wire = new Request(input instanceof Request ? input.url : input.toString(), init);
      const url = new URL(wire.url);
      const bytes = new Uint8Array(await wire.arrayBuffer());

      return request(url.pathname + url.search, wire.method, bytes.length ? bytes : undefined);
    },
  });

  return {
    request,
    rpc,
    forVault: (vaultId: Uint8Array): TClient => createClient({ ...options, vaultId }),
  };
}

export type TClient = ReturnType<typeof createClient>;
```

## apps/cli/src/client/request.ts :: checkServerMinimum

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function checkServerMinimum(response: Response, options: IClientOptions) {
  if (response.status === 426) {
    const verified = await hello(options.address, options.pin, options.fetcher, MIN_SERVER);

    if (p.compareSemver(options.version, verified.hello.minClient) < 0) {
      const latest = await latestRelease(options.fetcher).catch(() => undefined);

      if (latest && p.compareSemver(verified.hello.minClient, latest) > 0)
        throw new EnvdenError("CLIENT_TOO_OLD", "The server requires a version that doesn't exist");

      throw new EnvdenError("CLIENT_TOO_OLD", "Update envden to meet the signed server minimum");
    }

    throw new EnvdenError("INVALID_DATA", "Server rejected a supported client");
  }
}
```

## apps/cli/src/client/request.ts :: serializeRequestBody

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function serializeRequestBody(body: unknown) {
  if (body instanceof Uint8Array) return body;

  return body === undefined ? "" : JSON.stringify(body);
}
```

## apps/cli/src/client/untrusted.ts :: decodeUntrusted

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function decodeUntrusted<T>(codec: p.ICodec<T>, bytes: Uint8Array): T {
  try {
    return p.decode(codec, bytes);
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid data from server", { cause });
  }
}
```

## apps/cli/src/client/encoding.ts :: text

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function text(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
```

## apps/cli/src/client/encoding.ts :: binary

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function binary(value: string): Uint8Array {
  const bytes = new Uint8Array(Buffer.from(value, "base64url"));
  if (text(bytes) !== value) throw new EnvdenError("INVALID_DATA", "Invalid binary encoding");

  return bytes;
}
```

## apps/cli/src/client/hello.ts :: hello

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function hello(
  address: string,
  pin: Uint8Array | undefined,
  fetcher: TFetch,
  minServer = MIN_SERVER,
) {
  const url = new URL("/v1/hello", address);
  const challenge = p.randomBytes(32);
  url.searchParams.set("challenge", text(challenge));

  const response = await serverFetch(fetcher, url, {
    signal: AbortSignal.timeout(milliseconds({ seconds: 2 })),
    redirect: "error",
  });

  if (!response.ok)
    throw new EnvdenError(
      "UNAUTHORIZED",
      "Server didn't answer as envden. Check the address points at an envden server",
    );

  let body;

  try {
    body = p.HelloResponseSchema.parse(await response.json());
  } catch (cause) {
    throw new EnvdenError(
      "INVALID_DATA",
      "Server sent an invalid hello. Check the address points at an envden server",
      { cause },
    );
  }

  const signed = decodeUntrusted(p.signedCodec(p.ServerHelloCodec), binary(body.hello));
  const presented = p.serverPin(signed.body.serverSignPub);
  const result = p.verifyHello(signed, challenge, url.hostname, pin ?? presented, "0.0.0");

  if (!result.ok)
    throw new EnvdenError(
      "UNAUTHORIZED",
      "Server identity doesn't match the expected server. Check the server address",
    );

  if (p.compareSemver(result.value.appVersion, minServer) < 0)
    throw new EnvdenError("SERVER_TOO_OLD", "Server is too old for this envden. Update the server");

  if (!result.value.protocols.includes(1))
    throw new EnvdenError(
      "UPDATE_REQUIRED",
      "Server has no protocol this envden knows. Update envden",
    );

  return { pin: presented, hello: result.value };
}

const servers = new WeakMap<TFetch, Map<string, ReturnType<typeof hello>>>();
```

## apps/cli/src/client/hello.ts :: memberHello

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function memberHello(address: string, pin: Uint8Array, fetcher: TFetch) {
  let cache = servers.get(fetcher);

  if (!cache) {
    cache = new Map();
    servers.set(fetcher, cache);
  }

  const key = `${new URL(address).origin}/${text(pin)}`;
  let pending = cache.get(key);

  if (!pending) {
    pending = hello(address, pin, fetcher).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });

    cache.set(key, pending);
  }

  return pending;
}
```

## apps/cli/src/client/fetch.ts :: serverFetch

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function serverFetch(fetcher: TFetch, ...args: Parameters<TFetch>) {
  try {
    return await fetcher(...args);
  } catch (cause) {
    if (cause instanceof EnvdenError) throw cause;

    throw new EnvdenError(
      "SERVER_UNREACHABLE",
      "Server unreachable; check the server address and your private network",
      { cause },
    );
  }
}
```

## packages/adapters/repo/git/src/adapter.ts :: createGitRepoAdapter

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function createGitRepoAdapter(
  options: {
    resolveSshHost?: (host: string) => Promise<string>;
    skipFolders?: string[];
  } = {},
): IRepoAdapter {
  return {
    id: "git",
    caseInsensitive: (root, readOnly) => caseInsensitive(root, readOnly).catch(repoFailure),
    checkoutAt: (path) =>
      checkoutAt(path, options.resolveSshHost ?? resolveSshHost).catch(repoFailure),
    worktrees: (checkout) => worktrees(checkout).catch(repoFailure),
    submodules: (checkout) => submodules(checkout).catch(repoFailure),
    envFiles: (checkout, rules) =>
      envFiles(checkout, {
        ...rules,
        extraSkipped: [...(options.skipFolders ?? []), ...(rules?.extraSkipped ?? [])],
      }).catch(repoFailure),
    isIgnored: (checkout, path) => isIgnored(checkout, path).catch(repoFailure),
    ensureIgnored: (checkout, path) => ensureIgnored(checkout, path).catch(repoFailure),
  };
}
```

## packages/adapters/repo/git/src/failures/operation.ts :: repoFailure

PENDING

Ordered steps, including branches:

```ts
export function repoFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("INTERNAL", "Repository operation failed", { cause });
}
```

## packages/adapters/repo/git/src/failures/exit-code.ts :: exitCode

PENDING

Ordered steps, including branches:

```ts
export function exitCode(error: unknown): number | undefined {
  if (
    error instanceof EnvdenError &&
    error.cause &&
    typeof error.cause === "object" &&
    "exitCode" in error.cause &&
    typeof error.cause.exitCode === "number"
  )
    return error.cause.exitCode;

  return undefined;
}
```

## packages/adapters/repo/git/src/repo-id/ssh.ts :: resolveSshHost

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function resolveSshHost(host: string, run = exec): Promise<string> {
  if (host.startsWith("-") || !/^[A-Za-z0-9._-]+$/.test(host))
    throw new EnvdenError("INVALID_INPUT", "Unsafe SSH host");

  const { stdout } = await run("ssh", ["-G", "--", host]);
  const hostname = /^hostname\s+(.+)$/m.exec(stdout)?.[1];
  if (!hostname) throw new EnvdenError("INTERNAL", "SSH hostname resolution failed");

  return hostname.trim();
}
```

## packages/adapters/repo/git/src/repo-id/remote-url.ts :: remoteUrl

PENDING

Ordered steps, including branches:

```ts
export async function remoteUrl(root: string, name: string): Promise<string> {
  const git = await gitSession(root, await globalConfig("^url\\..*\\.insteadof$"));

  return (await git(["remote", "get-url", name])).trim();
}
```

## packages/adapters/repo/git/src/repo-id/normalize.ts :: normalizeRepoId

PENDING

Ordered steps, including branches:

```ts
export function normalizeRepoId(remote: string, resolvedHostname?: string): string {
  try {
    return normalize(remote, resolvedHostname);
  } catch (cause) {
    if (cause instanceof EnvdenError) throw cause;
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote", { cause });
  }
}
```

## packages/adapters/repo/git/src/repo-id/normalize.ts :: normalize

PENDING

Ordered steps, including branches:

```ts
function normalize(remote: string, resolvedHostname?: string): string {
  if (/[\p{Cc}\p{Cf}]/u.test(decodeURIComponent(remote)))
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote");

  const parts = remoteParts(remote.trim());
  const host = (resolvedHostname ?? parts.host).toLowerCase();
  let path = parts.path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (host === "github.com" || host === "gitlab.com") path = path.toLowerCase();

  if (/[\p{Cc}\p{Cf}]/u.test(host + path) || !host || /[\\/\s\0]/.test(host) || unsafePath(path))
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote");

  return `${host}/${path}`;
}
```

## packages/adapters/repo/git/src/repo-id/normalize.ts :: unsafePath

PENDING

Ordered steps, including branches:

```ts
function unsafePath(path: string) {
  return (
    !path ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\\p{Cc}\p{Cf}]/u.test(path)
  );
}
```

## packages/adapters/repo/git/src/repo-id/remote.ts :: remoteParts

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function remoteParts(remote: string): { host: string; path: string; ssh: boolean } {
  if (remote.includes("://")) {
    if (!/^(ssh|https?|git):\/\//i.test(remote))
      throw new EnvdenError("INVALID_INPUT", "Unsupported git remote");

    if (
      decodeURIComponent(remote)
        .split("/")
        .some((part) => part === ".." || part === ".")
    )
      throw new EnvdenError("INVALID_INPUT", "Unsafe git remote");

    const url = new URL(remote);

    if (!url.hostname || url.search || url.hash)
      throw new EnvdenError("INVALID_INPUT", "Unsupported git remote");

    return {
      host: url.hostname,
      path: decodeURIComponent(url.pathname),
      ssh: url.protocol === "ssh:",
    };
  }

  const scp = /^(?:[^@/\s]+@)?(\[[^\]]+\]|[^:/\s]+):(.+)$/.exec(remote);
  if (!scp) throw new EnvdenError("INVALID_INPUT", "A hosted git remote is required");

  return { host: scp[1]!, path: scp[2]!, ssh: true };
}
```

## packages/adapters/repo/git/src/ignore/ensure-ignored.ts :: ensureIgnored

PENDING

Ordered steps, including branches:

```ts
export async function ensureIgnored(checkout: ICheckout, path: string): Promise<void> {
  validatePath(path);

  if (await tracked(checkout, path))
    throw new EnvdenError("INVALID_INPUT", "Refusing a tracked env file");

  if (await isIgnored(checkout, path)) return;

  if (/[\p{Cc}\p{Cf}]/u.test(path)) throw new EnvdenError("INVALID_INPUT", "Unsafe ignore path");

  const exclude = resolve(
    checkout.root,
    (await git(checkout.root, ["rev-parse", "--git-path", "info/exclude"])).trimEnd(),
  );

  const parents = await excludeParents(checkout.gitDir, exclude);

  const escaped = path.replace(/[\\*?[\]#! ]/g, "\\$&");

  const file = await open(
    exclude,
    constants.O_RDWR |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );

  try {
    const stat = await file.stat();

    if (!stat.isFile() || stat.nlink !== 1 || (process.getuid && stat.uid !== process.getuid()))
      throw new EnvdenError("INVALID_INPUT", "Exclude is not a private regular file");

    if ((await realpath(dirname(exclude))) !== dirname(exclude))
      throw new EnvdenError("INVALID_INPUT", "Unsafe exclude parent");

    await verifyExcludeParents(parents);
    const original = await file.readFile("utf8");
    const line = `/${escaped}`;
    const added = !original.split("\n").includes(line);
    const suffix = `\n${line}\n`;
    if (added) await file.writeFile(suffix);

    try {
      if (!(await isIgnored(checkout, path)))
        throw new EnvdenError("INVALID_INPUT", "Could not ignore env file");
    } catch (error) {
      if (added && (await file.stat()).size === stat.size + Buffer.byteLength(suffix))
        await file.truncate(stat.size);

      throw error;
    }
  } finally {
    await file.close();
  }
}
```

## packages/adapters/repo/git/src/ignore/parents.ts :: excludeParents

PENDING

Ordered steps, including branches:

```ts
export async function excludeParents(gitDir: string, exclude: string) {
  const common = await realpath(gitDir);
  const parent = relative(common, dirname(exclude));

  if (parent === ".." || parent.startsWith(`..${sep}`) || isAbsolute(parent))
    throw new EnvdenError("INVALID_INPUT", "Exclude path escapes git directory");

  const parents = [];
  let current = common;

  for (const part of ["", ...parent.split(/[\\/]/).filter(Boolean)]) {
    current = join(current, part);

    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
        throw error;
    }

    const stat = await lstat(current);
    parents.push({ path: current, dev: stat.dev, ino: stat.ino });

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe exclude parent");
  }

  return parents;
}
```

## packages/adapters/repo/git/src/ignore/parents.ts :: verifyExcludeParents

PENDING

Ordered steps, including branches:

```ts
export async function verifyExcludeParents(parents: Awaited<ReturnType<typeof excludeParents>>) {
  await Promise.all(
    parents.map(async (parent) => {
      if ((await realpath(parent.path)) !== parent.path)
        throw new EnvdenError("CONFLICT", "Exclude parent changed");

      const current = await lstat(parent.path);

      const sameDirectory =
        current.isDirectory() && current.dev === parent.dev && current.ino === parent.ino;

      if (!sameDirectory) throw new EnvdenError("CONFLICT", "Exclude parent changed");
    }),
  );
}
```

## packages/adapters/repo/git/src/ignore/is-ignored.ts :: isIgnored

PENDING

Ordered steps, including branches:

```ts
export async function isIgnored(checkout: ICheckout, path: string): Promise<boolean> {
  validatePath(path);
  if (await tracked(checkout, path)) return false;

  try {
    await git(checkout.root, ["check-ignore", "-q", "--", path]);

    return true;
  } catch (error) {
    if (
      error instanceof EnvdenError &&
      error.cause &&
      typeof error.cause === "object" &&
      "exitCode" in error.cause &&
      error.cause.exitCode === 1
    )
      return false;

    throw error;
  }
}
```

## packages/adapters/repo/git/src/checkout/worktrees.ts :: worktrees

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function worktrees(
  checkout: ICheckout,
  run = (args: string[]) => git(checkout.root, args),
): Promise<string[]> {
  const separated = await run([...LIST, "-z"]).catch(() => undefined);
  if (separated !== undefined) return worktreePaths(separated, "\0");

  return worktreePaths(await run(LIST), "\n");
}

// records end with an empty field; a prunable worktree's folder is gone and a bare one has no files
```

## packages/adapters/repo/git/src/checkout/worktrees.ts :: worktreePaths

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function worktreePaths(output: string, separator: string) {
  return output
    .split(separator + separator)
    .map((record) => record.split(separator))
    .filter((fields) => !fields.some((field) => field === "bare" || field.startsWith("prunable")))
    .flatMap((fields) => fields.filter((field) => field.startsWith("worktree ")))
    .map((field) => normalize(field.slice(9)));
}
```

## packages/adapters/repo/git/src/checkout/case.ts :: caseInsensitive

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function caseInsensitive(root: string, readOnly = false): Promise<boolean> {
  const probe = caseProbe(await readdir(root));
  if (probe.kind === "sensitive") return false;

  if (probe.kind === "compare") {
    const original = await lstat(join(root, probe.name));
    const alternate = await lstat(join(root, probe.alternate)).catch(missing);

    return alternate?.dev === original.dev && alternate?.ino === original.ino;
  }

  if (readOnly)
    throw new EnvdenError("NOT_IMPLEMENTED", "Filesystem case behavior requires a writable probe");

  return writableProbe(root);
}
```

## packages/adapters/repo/git/src/checkout/case.ts :: writableProbe

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function writableProbe(root: string) {
  const name = `.envden-case-${crypto.randomUUID()}`;
  const path = join(root, name);
  const file = await open(path, "wx", 0o600);

  try {
    const original = await file.stat();

    const alternate = await lstat(join(root, name.toUpperCase())).catch(missing);

    return alternate?.dev === original.dev && alternate?.ino === original.ino;
  } finally {
    await file.close();
    await rm(path, { force: true });
  }
}
```

## packages/adapters/repo/git/src/checkout/case.ts :: missing

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function missing(cause: unknown): undefined {
  if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
  throw cause;
}
```

## packages/adapters/repo/git/src/checkout/checkout.ts :: checkoutAt

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function checkoutAt(
  path: string,
  resolveHost: (host: string) => Promise<string>,
): Promise<ICheckout | undefined> {
  let root: string;

  try {
    const stat = await lstat(path);

    root = (
      await git(stat.isDirectory() ? path : dirname(path), ["rev-parse", "--show-toplevel"])
    ).trimEnd();
  } catch (error) {
    if (
      !(
        error instanceof EnvdenError &&
        error.cause &&
        typeof error.cause === "object" &&
        "exitCode" in error.cause
      )
    )
      throw error;

    return undefined;
  }

  const remotes = (await git(root, ["remote"])).trim().split("\n").filter(Boolean);

  const name = remotes.includes("origin")
    ? "origin"
    : remotes.length === 1
      ? remotes[0]
      : undefined;

  if (!name) throw new EnvdenError("INVALID_INPUT", "Choose a git remote for this checkout");
  const remote = await remoteUrl(root, name);
  const parts = remoteParts(remote);
  const repoId = normalizeRepoId(remote, parts.ssh ? await resolveHost(parts.host) : undefined);
  const common = (await git(root, ["rev-parse", "--git-common-dir"])).trimEnd();

  const gitDir = await realpath(resolve(root, common));

  const upstreamRepoId = remotes.includes("upstream")
    ? await upstreamId(root, resolveHost)
    : undefined;

  const directory = await lstat(gitDir);
  const rootStat = await lstat(await realpath(root));

  return {
    identity: `${directory.dev}:${directory.ino}:${directory.birthtimeMs}:${rootStat.ino}:${rootStat.birthtimeMs}`,
    rootDevice: rootStat.dev,
    ...(upstreamRepoId ? { upstreamRepoId } : {}),
    root: await realpath(root),
    repoId,
    gitDir,
    registeredWorktree: await registeredWorktree(root, gitDir),
  };
}
```

## packages/adapters/repo/git/src/checkout/checkout.ts :: upstreamId

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function upstreamId(root: string, resolveHost: (host: string) => Promise<string>) {
  const remote = await remoteUrl(root, "upstream");
  const parts = remoteParts(remote);

  return normalizeRepoId(remote, parts.ssh ? await resolveHost(parts.host) : undefined);
}
```

## packages/adapters/repo/git/src/checkout/case-probe.ts :: caseProbe

PENDING

Ordered steps, including branches:

```ts
export function caseProbe(
  names: readonly string[],
): { kind: "compare"; name: string; alternate: string } | { kind: "sensitive" | "empty" } {
  for (const name of names) {
    const alternate = name.replace(/[a-zA-Z]/, (letter) =>
      letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase(),
    );

    if (name === alternate) continue;
    if (names.includes(alternate)) return { kind: "sensitive" };

    return { kind: "compare", name, alternate };
  }

  return { kind: "empty" };
}
```

## packages/adapters/repo/git/src/checkout/submodules.ts :: submodules

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function submodules(checkout: ICheckout): Promise<string[]> {
  const output = await git(checkout.root, [
    "config",
    "--file",
    join(checkout.root, ".gitmodules"),
    "--no-includes",
    "-z",
    "--get-regexp",
    "^submodule\\..*\\.path$",
  ]).catch(noneFound);

  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => record.slice(record.indexOf("\n") + 1));
}

// exit 1 means no .gitmodules or no path in it
```

## packages/adapters/repo/git/src/checkout/submodules.ts :: noneFound

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function noneFound(error: unknown): string {
  if (exitCode(error) === 1) return "";

  throw error;
}
```

## packages/adapters/repo/git/src/checkout/registration.ts :: registeredWorktree

PENDING

Ordered steps, including branches:

```ts
export async function registeredWorktree(root: string, common: string): Promise<boolean> {
  try {
    const dotGit = join(root, ".git");
    const entry = await lstat(dotGit);
    if (!entry.isFile() || entry.isSymbolicLink()) return false;

    const privateDir = await realpath(
      resolve(root, (await git(root, ["rev-parse", "--git-dir"])).trimEnd()),
    );

    const worktrees = await lstat(join(common, "worktrees"));
    if (!worktrees.isDirectory() || worktrees.isSymbolicLink()) return false;
    const registrations = await realpath(join(common, "worktrees"));
    const name = relative(registrations, privateDir);

    if (!name || name.includes("/") || name.includes("\\") || name === ".." || isAbsolute(name))
      return false;

    const backlink = join(privateDir, "gitdir");
    if (!(await lstat(backlink)).isFile() || (await lstat(backlink)).isSymbolicLink()) return false;

    return (
      (await realpath(resolve(privateDir, (await readFile(backlink, "utf8")).trimEnd()))) ===
      (await realpath(dotGit))
    );
  } catch {
    return false;
  }
}
```

## packages/adapters/repo/git/src/env-files/tracked.ts :: tracked

PENDING

Ordered steps, including branches:

```ts
export async function tracked(checkout: ICheckout, path: string): Promise<boolean> {
  const insensitive = await caseInsensitive(checkout.root);
  const key = path.normalize("NFC");
  const files = (await git(checkout.root, ["ls-files", "-z"])).split("\0");

  return files.some((file) =>
    insensitive
      ? file.normalize("NFC").toLowerCase() === key.toLowerCase()
      : file.normalize("NFC") === key,
  );
}
```

## packages/adapters/repo/git/src/env-files/discovery.ts :: envFiles

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function envFiles(
  checkout: ICheckout,
  options: IEnvFileRules = {},
): Promise<string[]> {
  const files: string[] = [];

  const git = await gitSession(checkout.root);
  const insensitive = await caseInsensitive(checkout.root);

  const key = (path: string) =>
    insensitive ? path.normalize("NFC").toLowerCase() : path.normalize("NFC");

  const entries = (await git(["ls-files", "--stage", "-z"])).split("\0").filter(Boolean);

  const submodules = entries
    .filter((line) => line.startsWith("160000 "))
    .map((line) => line.slice(line.indexOf("\t") + 1));

  const tracked = new Set(entries.map((line) => key(line.slice(line.indexOf("\t") + 1))));
  await walk(checkout, "", options, submodules, files);
  const candidates = files.filter((path) => !tracked.has(key(path)));
  if (!candidates.length) return [];

  try {
    return (await git(["check-ignore", "--stdin", "-z"], candidates.join("\0") + "\0"))
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch (error) {
    if (exitCode(error) === 1) return [];

    throw error;
  }
}
```

## packages/adapters/repo/git/src/env-files/discovery.ts :: walk

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function walk(
  checkout: ICheckout,
  dir: string,
  options: IEnvFileRules,
  submodules: string[],
  files: string[],
): Promise<void> {
  const entries = await readableEntries(checkout.root, dir);
  if (nestedClone(dir, entries)) return;

  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (submodules.includes(path) || !encodable(path)) continue;

    if (entry.isDirectory()) {
      if (descends(path, options)) await walk(checkout, path, options, submodules, files);
    } else if (candidate(entry, path, options)) files.push(path);
  }
}
```

## packages/adapters/repo/git/src/env-files/discovery.ts :: descends

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function descends(path: string, options: IEnvFileRules) {
  return acceptsEnvPath(`${path}/.env`, { extraSkipped: options.extraSkipped ?? [] });
}

// a nested clone is its own repo (often vendored code), so its env files aren't this checkout's
```

## packages/adapters/repo/git/src/env-files/discovery.ts :: nestedClone

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function nestedClone(dir: string, entries: Dirent[]) {
  return !!dir && entries.some((entry) => entry.name === ".git");
}
```

## packages/adapters/repo/git/src/env-files/discovery.ts :: candidate

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function candidate(entry: Dirent, path: string, options: IEnvFileRules) {
  return (entry.isFile() || entry.isSymbolicLink()) && acceptsEnvPath(path, options);
}
```

## packages/adapters/repo/git/src/env-files/discovery.ts :: unreadable

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function unreadable(error: unknown) {
  return (
    error instanceof Error && "code" in error && (error.code === "EACCES" || error.code === "EPERM")
  );
}
```

## packages/adapters/repo/git/src/env-files/discovery.ts :: readableEntries

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function readableEntries(root: string, dir: string): Promise<Dirent[]> {
  try {
    return await readdir(resolve(root, dir), { withFileTypes: true });
  } catch (error) {
    if (dir && unreadable(error)) return [];
    throw error;
  }
}
```

## packages/adapters/repo/git/src/env-files/discovery.ts :: encodable

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function encodable(path: string) {
  try {
    validatePath(path);

    return true;
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "INVALID_DATA") return false;
    throw error;
  }
}
```

## packages/adapters/repo/git/src/exec/global-config.ts :: globalConfig

PENDING

Ordered steps, including branches:

```ts
export async function globalConfig(pattern: string): Promise<TConfigEntry[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["config", "--global", "--null", "--get-regexp", pattern],
      {
        env: { GIT_CONFIG_NOSYSTEM: "1" },
      },
    );

    return parseEntries(stdout);
  } catch (error) {
    if (
      error instanceof EnvdenError &&
      error.cause &&
      typeof error.cause === "object" &&
      "exitCode" in error.cause &&
      error.cause.exitCode === 1
    )
      return [];

    throw error;
  }
}
```

## packages/adapters/repo/git/src/exec/global-config.ts :: parseEntries

PENDING

Ordered steps, including branches:

```ts
function parseEntries(stdout: string): TConfigEntry[] {
  return stdout.split("\0").flatMap((entry) => {
    const split = entry.indexOf("\n");

    return split === -1 ? [] : [[entry.slice(0, split), entry.slice(split + 1)] as TConfigEntry];
  });
}
```

## packages/adapters/repo/git/src/exec/git.ts :: git

PENDING

Ordered steps, including branches:

```ts
export async function git(root: string, args: string[], input?: string): Promise<string> {
  return (await gitSession(root))(args, input);
}
```

## packages/adapters/repo/git/src/exec/git.ts :: gitSession

PENDING

Ordered steps, including branches:

```ts
export async function gitSession(root: string, config: TConfigEntry[] = []) {
  const directories = (await globalConfig("^safe\\.directory$")).flatMap(([key, value]) => [
    "-c",
    `${key}=${value}`,
  ]);

  return async (args: string[], input?: string): Promise<string> => {
    const { stdout } = await exec(
      "git",
      [
        ...safeConfig,
        ...directories,
        ...(args[0] === "ls-files" ? ["--literal-pathspecs"] : []),
        "-C",
        root,
        ...args,
      ],
      {
        ...(input === undefined ? {} : { stdin: new Blob([input]) }),
        env: {
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_PAGER: "cat",
          GIT_CONFIG_NOSYSTEM: "1",
          // git reads /dev/null as an empty file on every platform, Git for Windows included
          GIT_CONFIG_GLOBAL: "/dev/null",
          ...configEnvironment(config),
        },
      },
    );

    return stdout;
  };
}

// Env pairs, unlike -c, keep keys that contain "=" intact.
```

## packages/adapters/repo/git/src/exec/git.ts :: configEnvironment

PENDING

Ordered steps, including branches:

```ts
function configEnvironment(config: TConfigEntry[]): Record<string, string> {
  if (config.length === 0) return {};

  return Object.fromEntries([
    ["GIT_CONFIG_COUNT", String(config.length)],
    ...config.flatMap(([key, value], index) => [
      [`GIT_CONFIG_KEY_${index}`, key],
      [`GIT_CONFIG_VALUE_${index}`, value],
    ]),
  ]);
}
```

## packages/adapters/shell/rc/src/adapter.ts :: read

PENDING

Ordered steps, including branches:

```ts
async function read(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}

class RcShellAdapter implements IShellAdapter {
  readonly id: TShell;

  private readonly home: string;
  private readonly envdenHome: string;
  private readonly backupDirectory: string | undefined;
  private readonly resolveProfile: () => string | undefined;
  private profile: string | undefined;

  constructor(
    shell: TShell,
    home = homedir(),
    envdenHome = process.env.ENVDEN_HOME ?? join(home, ".envden"),
    backupDirectory?: string,
    resolveProfile = () => (home === homedir() ? powerShellProfile() : undefined),
  ) {
    this.id = shell;
    this.home = home;
    this.envdenHome = envdenHome;
    this.backupDirectory = backupDirectory;
    this.resolveProfile = resolveProfile;
  }

  rcPath() {
    switch (this.id) {
      case "zsh":
        return join(this.home, ".zshrc");
      case "bash":
        return bashRcPath(this.home);
      case "fish":
        return join(this.home, ".config", "fish", "config.fish");
      case "powershell":
        return (this.profile ??=
          this.resolveProfile() ??
          (process.platform === "win32"
            ? join(this.home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
            : join(this.home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1")));
    }
  }

  hookSnippet(binaryPath: string) {
    return renderHook(this.id, binaryPath, this.envdenHome);
  }

  async installed() {
    const value = await read(this.rcPath());

    return strip(value) !== value;
  }

  async install(binaryPath: string) {
    await editRc(
      this.rcPath(),
      (value) => {
        const current = strip(value);

        const newline = value.includes("\r\n") ? "\r\n" : "\n";

        const snippet = Buffer.from(
          this.hookSnippet(binaryPath).replaceAll("\n", newline),
        ).toString("latin1");

        return `${current}${current && !current.endsWith("\n") ? newline : ""}${snippet}`;
      },
      this.backupDirectory,
    );
  }

  async uninstall() {
    await editRc(this.rcPath(), strip, this.backupDirectory);
  }
}

// An orphan start marker never pairs with a later block's end, so user lines between them survive.
```

## packages/adapters/shell/rc/src/adapter.ts :: strip

PENDING

Ordered steps, including branches:

```ts
function strip(value: string) {
  return value.replace(
    /# >>> envden >>>\r?\n(?:(?!# >>> envden >>>)[\s\S])*?# <<< envden <<<(?:\r?\n)?/g,
    "",
  );
}
```

## packages/adapters/shell/rc/src/adapter.ts :: createRcShellAdapter

PENDING

Ordered steps, including branches:

```ts
export function createRcShellAdapter(
  shell: TShell,
  home?: string,
  envdenHome?: string,
  backupDirectory?: string,
  resolveProfile?: () => string | undefined,
): IShellAdapter {
  const adapter = new RcShellAdapter(shell, home, envdenHome, backupDirectory, resolveProfile);

  return {
    id: adapter.id,
    rcPath: () => adapter.rcPath(),
    hookSnippet: (binaryPath) => adapter.hookSnippet(binaryPath),
    installed: () => adapter.installed().catch(shellFailure),
    install: (binaryPath) => adapter.install(binaryPath).catch(shellFailure),
    uninstall: () => adapter.uninstall().catch(shellFailure),
  };
}
```

## packages/adapters/shell/rc/src/render.ts :: renderHook

PENDING

Ordered steps, including branches:

```ts
export function renderHook(shell: TShell, binaryPath: string, envdenHome: string) {
  if (!isAbsolute(binaryPath) || /[\r\n]/.test(binaryPath + envdenHome))
    throw new EnvdenError("INVALID_INPUT", "Hook paths must be absolute and single-line");

  const state = join(envdenHome, "state");
  const shellQuote = shell === "fish" ? fishQuote : quote;

  const paths = {
    notice: shellQuote(join(state, "notice")),
    approved: shellQuote(join(state, "approved-checkouts")),
    offered: shellQuote(join(state, "track-offered")),
    offers: shellQuote(join(state, "track-offers")),
    update: shellQuote(join(state, "notice-update")),
    day: shellQuote(join(state, "update-offered-day")),
  };

  const command = `env -u BUN_OPTIONS -u BUN_BE_BUN ${shellQuote(binaryPath)} status --refresh-cache`;
  let body: string;

  switch (shell) {
    case "bash":
    case "zsh": {
      body = `_envden_notice() {
  local saved_status=$?
  [ "\${_envden_last_pwd-}" != "$PWD" ] || return "$saved_status"
  _envden_last_pwd="$PWD"
  local physical=${shell === "zsh" ? '"${PWD:A}"' : '"$(pwd -P)"'}
  local root approved=0 cache=${paths.notice} now modified
  [ -r ${paths.approved} ] && while IFS= read -r root; do
    [ -n "$root" ] || continue
    if _envden_inside "$root" "$physical"; then approved=1; break; fi
  done 2>/dev/null < ${paths.approved}
  local offered=${paths.offered} root_seen=0 day line
  [ -r ${paths.offers} ] && while IFS= read -r root; do
    [ -n "$root" ] || continue
    if _envden_inside "$root" "$physical"; then
      root_seen=0
      [ -r "$offered" ] && while IFS= read -r line; do [ "$line" != "$root" ] || root_seen=1; done 2>/dev/null < "$offered"
      if [ "$root_seen" = 0 ]; then
        printf '%s\\n' 'envden: env files found; run envden track'
        printf '%s\\n' "$root" >> "$offered"
      fi
      break
    fi
  done 2>/dev/null < ${paths.offers}
  day=$(date +%Y-%m-%d)
  [ -r ${paths.update} ] && while IFS= read -r line; do
    case "$line" in
      'envden: update required; run envden update') printf '%s\\n' "$line" ;;
      'envden: update available; run envden update')
        if [ "$(cat -- ${paths.day} 2>/dev/null)" != "$day" ]; then
          printf '%s\\n' "$line"
          printf '%s\\n' "$day" > ${paths.day}
        fi ;;
    esac
  done 2>/dev/null < ${paths.update}
  if [ "$approved" = 1 ] && [ -f "$cache" ]; then LC_ALL=C tr -cd '\\11\\12\\40-\\176' < "$cache"; fi
  now=$(date +%s)
  modified=$(stat -c %Y "$cache" 2>/dev/null) || modified=$(stat -f %m "$cache" 2>/dev/null) || modified=0
  if [ "$((now - modified))" -gt 60 ]; then
    (${command} </dev/null >/dev/null 2>&1 &)
  fi
  return "$saved_status"
}
`;

      body +=
        shell === "zsh"
          ? "autoload -Uz add-zsh-hook\nadd-zsh-hook -d chpwd _envden_notice\nadd-zsh-hook chpwd _envden_notice\n_envden_notice"
          : 'case ";${PROMPT_COMMAND:-};" in *\'_envden_notice;\'*) ;; *) PROMPT_COMMAND="_envden_notice;${PROMPT_COMMAND:-}" ;; esac\n_envden_notice';

      break;
    }
    case "fish":
      body = `function _envden_notice --on-variable PWD
  set -l saved_status $status
  set -l cache ${paths.notice}
  set -l physical (pwd -P)
  set -l approved 0
  if test -f ${paths.approved}
    while read -l root
      if test -n "$root"; and _envden_inside "$root" "$physical"
        set approved 1
        break
      end
    end < ${paths.approved}
  end
  set -l offered ${paths.offered}
  if test -f ${paths.offers}
    while read -l root
      if test -n "$root"; and _envden_inside "$root" "$physical"
        if not contains -- "$root" (cat -- "$offered" 2>/dev/null)
          printf '%s\\n' 'envden: env files found; run envden track'
          printf '%s\\n' "$root" >> "$offered"
        end
        break
      end
    end < ${paths.offers}
  end
  set -l day (date +%Y-%m-%d)
  if test -f ${paths.update}
    while read -l line
      switch "$line"
        case 'envden: update required; run envden update'
          printf '%s\\n' "$line"
        case 'envden: update available; run envden update'
          if test (cat -- ${paths.day} 2>/dev/null; or echo missing) != "$day"
            printf '%s\\n' "$line"
            printf '%s\\n' "$day" > ${paths.day}
          end
      end
    end < ${paths.update}
  end
  if test "$approved" = 1; and test -f "$cache"
    env LC_ALL=C tr -cd '\\11\\12\\40-\\176' < "$cache"
  end
  set -l modified (stat -c %Y "$cache" 2>/dev/null; or stat -f %m "$cache" 2>/dev/null; or echo 0)
  if test (math (date +%s) - "$modified") -gt 60
    ${command} </dev/null >/dev/null 2>&1 &
    disown
  end
  return $saved_status
end
_envden_notice`;

      break;
    case "powershell":
      body = `if (!$global:EnvdenPreviousPrompt) { $global:EnvdenPreviousPrompt = $function:prompt }
```

## packages/adapters/shell/rc/src/render.ts :: global

PENDING

Ordered steps, including branches:

```ts
function global:prompt {
  $envdenSuccess = $?
  $envdenExitCode = $global:LASTEXITCODE
  $physical = _envden_physical_path ((Get-Location).ProviderPath)
  $insensitive = @(Get-Content -LiteralPath ${psQuote(join(state, "approved-checkouts-insensitive"))} -ErrorAction SilentlyContinue)
  $cache = ${psQuote(join(state, "notice"))}
  $approved = @(Get-Content -LiteralPath ${psQuote(join(state, "approved-checkouts"))} -ErrorAction SilentlyContinue | Where-Object { $_ -and (($physical.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar).StartsWith($_.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar, $(if ($insensitive -ccontains $_) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }))) }).Count -gt 0
  $changed = $global:EnvdenLastDirectory -cne $PWD.Path
  $global:EnvdenLastDirectory = $PWD.Path
  if ($changed) {
    $offered = ${psQuote(join(state, "track-offered"))}
    foreach ($root in @(Get-Content -LiteralPath ${psQuote(join(state, "track-offers"))} -ErrorAction SilentlyContinue)) {
      if ($root -and (($physical.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar).StartsWith($root.TrimEnd('/','\\') + [IO.Path]::DirectorySeparatorChar, $(if ($IsWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal })))) {
        if (@(Get-Content -LiteralPath $offered -ErrorAction SilentlyContinue) -cnotcontains $root) {
          Write-Host 'envden: env files found; run envden track'
          Add-Content -LiteralPath $offered -Value $root
        }
        break
      }
    }
    $day = (Get-Date).ToString('yyyy-MM-dd')
    $dayFile = ${psQuote(join(state, "update-offered-day"))}
    foreach ($line in @(Get-Content -LiteralPath ${psQuote(join(state, "notice-update"))} -ErrorAction SilentlyContinue)) {
      if ($line -ceq 'envden: update required; run envden update') { Write-Host $line }
      if ($line -ceq 'envden: update available; run envden update' -and (Get-Content -LiteralPath $dayFile -ErrorAction SilentlyContinue) -cne $day) {
        Write-Host $line
        Set-Content -LiteralPath $dayFile -Value $day
      }
    }
    if ($approved -and (Test-Path -LiteralPath $cache)) { Get-Content -LiteralPath $cache | ForEach-Object { $_ -replace '[^\\x20-\\x7E]', '' } | Out-Host }
    if (!(Test-Path -LiteralPath $cache) -or ((Get-Date) - (Get-Item -LiteralPath $cache).LastWriteTime).TotalSeconds -gt 60) {
      $info = [Diagnostics.ProcessStartInfo]::new(${psQuote(binaryPath)})
      $info.Arguments = 'status --refresh-cache'
      $info.UseShellExecute = $false; $info.CreateNoWindow = $true
      $info.Environment.Remove('BUN_OPTIONS'); $info.Environment.Remove('BUN_BE_BUN')
      $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
      $process = [Diagnostics.Process]::Start($info)
      $process.Dispose()
    }
  }
  $global:LASTEXITCODE = $envdenExitCode
  if (!$envdenSuccess) { Write-Error 'Previous command failed' -ErrorAction Ignore }
  & $global:EnvdenPreviousPrompt
}`;

      break;
  }

  return `${start}\n${renderPhysical(shell)}\n${body}\n${end}\n`;
}
```

## packages/adapters/shell/rc/src/failures/operation.ts :: shellFailure

PENDING

Ordered steps, including branches:

```ts
export function shellFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("INTERNAL", "Shell configuration operation failed", { cause });
}
```

## packages/adapters/shell/rc/src/render/physical.ts :: renderPhysical

PENDING

Ordered steps, including branches:

```ts
export function renderPhysical(shell: TShell) {
  if (shell === "powershell")
    return `function _envden_physical_path([string]$path) {
  if (!$path) { return '' }
  $directory = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if (!$directory) { return '' }
  if ($directory.LinkType) {
    try { $target = $directory.ResolveLinkTarget($true) } catch { return '' }
    if ($target) { return _envden_physical_path $target.FullName }
  }
  if (!$directory.Parent) { return $directory.FullName }
  $parent = _envden_physical_path $directory.Parent.FullName
  if (!$parent) { return '' }
  return [IO.Path]::Combine($parent, $directory.Name)
}`;

  if (shell === "fish")
    return `function _envden_inside
  set -l directory $argv[2]
  while test -n "$directory"
    if test "$directory" -ef "$argv[1]"
      return 0
    end
    if test "$directory" = /
      break
    end
    set directory (string replace -r '/[^/]*$' '' -- "$directory")
    test -n "$directory"; or set directory /
  end
  return 1
end`;

  return `_envden_inside() {
  local directory="$2"
  while [ -n "$directory" ]; do
    [ "$directory" -ef "$1" ] && return 0
    [ "$directory" != / ] || break
    directory="\${directory%/*}"
    [ -n "$directory" ] || directory=/
  done
  return 1
}`;
}
```

## packages/adapters/shell/rc/src/files/bash-profile.ts :: bashRcPath

PENDING

Ordered steps, including branches:

```ts
export function bashRcPath(home: string, platform = process.platform) {
  if (platform !== "darwin") return join(home, ".bashrc");

  const candidates = [".bashrc", ".bash_profile", ".bash_login", ".profile"].map((name) => ({
    name,
    content: read(join(home, name)),
  }));

  const installed = candidates.find((file) => file.content?.includes(start));
  if (installed) return join(home, installed.name);
  const profile = candidates.slice(1).find((file) => file.content !== undefined);
  if (!profile) return join(home, ".bash_profile");

  const sourcesRc = profile
    .content!.split("\n")
    .some(
      (line) =>
        !line.trimStart().startsWith("#") &&
        /(?:^|[\s;&|])(?:source|\.)\s+["']?(?:~|\$HOME|\$\{HOME\})\/\.bashrc["']?(?:\s|;|$)/.test(
          line,
        ),
    );

  return join(home, sourcesRc ? ".bashrc" : profile.name);
}
```

## packages/adapters/shell/rc/src/files/bash-profile.ts :: read

PENDING

Ordered steps, including branches:

```ts
function read(path: string) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
```

## packages/adapters/shell/rc/src/files/windows.ts :: verifyWindowsOwner

PENDING

Ordered steps, including branches:

```ts
export async function verifyWindowsOwner(path: string): Promise<void> {
  const { stdout } = await execTrusted(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; $p=$env:ENVDEN_RC_PATH; $a=[IO.File]::GetAttributes($p); if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }; $acl=if (($a -band [IO.FileAttributes]::Directory) -ne 0) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }; $owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent(); ($owner -eq $identity.User.Value) -or ($owner -eq $identity.Owner.Value)",
    ],
    { env: { ENVDEN_RC_PATH: path } },
  );

  if (stdout.trim() !== "True")
    throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration owner");
}
```

## packages/adapters/shell/rc/src/files/stat.ts :: rcStat

PENDING

Ordered steps, including branches:

```ts
export async function rcStat(file: FileHandle, resolved: string) {
  const opened = await file.stat();
  const stat = await lstat(resolved);
  validateRc(opened);
  validateRc(stat);

  if (opened.dev !== stat.dev || opened.ino !== stat.ino)
    throw new EnvdenError("CONFLICT", "Shell configuration changed during editing");

  if (process.platform === "win32") await verifyWindowsOwner(resolved);

  return stat;
}
```

## packages/adapters/shell/rc/src/files/stat.ts :: validateRc

PENDING

Ordered steps, including branches:

```ts
function validateRc(stat: Awaited<ReturnType<typeof lstat>>) {
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (process.platform !== "win32" && stat.uid !== process.getuid?.())
  )
    throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration file");
}
```

## packages/adapters/shell/rc/src/files/edit.ts :: editRc

PENDING

Ordered steps, including branches:

```ts
export async function editRc(
  path: string,
  transform: (current: string) => string,
  backupDirectory?: string,
  hooks: IEditHooks = {},
) {
  const edit = await readRc(path, transform, backupDirectory, hooks);
  if (!edit) return;
  const { resolved, stat, next } = edit;
  const temporary = join(dirname(resolved), `.envden-rc-${crypto.randomUUID()}`);

  try {
    const replacement = await open(temporary, "wx", stat.mode & 0o777);

    try {
      await replacement.chmod(stat.mode & 0o777);
      await replacement.writeFile(Buffer.from(next, "latin1"));
      await replacement.sync();
    } finally {
      await replacement.close();
    }

    const current = await lstat(resolved);

    if (!sameRc(current, stat))
      throw new EnvdenError("CONFLICT", "Shell configuration changed during editing");

    await replaceRc(temporary, resolved, stat);
  } finally {
    await rm(temporary, { force: true });
  }
}
```

## packages/adapters/shell/rc/src/files/edit.ts :: readRc

PENDING

Ordered steps, including branches:

```ts
async function readRc(
  path: string,
  transform: (current: string) => string,
  backupDirectory: string | undefined,
  hooks: IEditHooks,
) {
  const target = await resolveRc(path, transform);
  if (!target) return;
  const { resolved, flags } = target;

  await hooks.resolved?.();
  const file = await open(resolved, flags, 0o600);

  try {
    const stat = await rcStat(file, resolved);

    await hooks.opened?.();
    const original = await file.readFile();
    const next = transform(original.toString("latin1"));
    await hooks.read?.();
    if (next === original.toString("latin1")) return;
    if (backupDirectory) await backupRc(backupDirectory, original);

    return { resolved, stat, next };
  } finally {
    await file.close();
  }
}
```

## packages/adapters/shell/rc/src/files/edit.ts :: replaceRc

PENDING

Ordered steps, including branches:

```ts
async function replaceRc(
  temporary: string,
  destination: string,
  expected: Awaited<ReturnType<typeof lstat>>,
) {
  try {
    await rename(temporary, destination);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "EPERM")) throw cause;
    const current = await lstat(destination);

    if (!sameRc(current, expected) || current.mode & 0o200) throw cause;

    await chmod(destination, current.mode | 0o200);

    try {
      await rename(temporary, destination);
    } catch (error) {
      await chmod(destination, current.mode);
      throw error;
    }
  }
}
```

## packages/adapters/shell/rc/src/files/edit.ts :: resolveRc

PENDING

Ordered steps, including branches:

```ts
async function resolveRc(path: string, transform: (current: string) => string) {
  let resolved = path;

  for (let hops = 0; hops < MAX_LINKS; hops++) {
    const real = await realpath(resolved).catch(missing);

    if (real !== undefined)
      return { resolved: real, flags: constants.O_RDONLY | constants.O_NOFOLLOW };

    if (!(await lstat(resolved).catch(missing))?.isSymbolicLink()) break;

    // a dangling link into a dotfiles repo: create the file it points to
    resolved = resolve(dirname(resolved), await readlink(resolved));
  }

  if (transform("") === "") return;
  await mkdir(dirname(resolved), { recursive: true });

  return {
    resolved,
    flags: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CREAT | constants.O_EXCL,
  };
}
```

## packages/adapters/shell/rc/src/files/edit.ts :: missing

PENDING

Ordered steps, including branches:

```ts
function missing(error: unknown): undefined {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
  throw error;
}
```

## packages/adapters/shell/rc/src/files/edit.ts :: sameRc

PENDING

Ordered steps, including branches:

```ts
function sameRc(
  current: Awaited<ReturnType<typeof lstat>>,
  expected: Awaited<ReturnType<typeof lstat>>,
) {
  return (["dev", "ino", "size", "mtimeMs", "ctimeMs"] as const).every(
    (key) => current[key] === expected[key],
  );
}
```

## packages/adapters/shell/rc/src/files/backup.ts :: backupRc

PENDING

Ordered steps, including branches:

```ts
export async function backupRc(directory: string, original: Uint8Array) {
  await mkdir(directory, { recursive: true, mode: 0o700 });

  if (process.platform === "win32") {
    await verifyWindowsOwner(directory);

    await execTrusted("icacls", [
      directory,
      "/inheritance:r",
      "/grant:r",
      `${userInfo().username}:(OI)(CI)F`,
    ]);
  }

  const folder = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);

  try {
    const stat = await folder.stat();

    if (
      !stat.isDirectory() ||
      (process.platform !== "win32" &&
        (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0))
    )
      throw new EnvdenError("INVALID_INPUT", "Unsafe shell backup directory");

    const file = await open(join(directory, `.envden-backup-${randomUUID()}`), "wx", 0o600);

    try {
      await file.writeFile(original);
      await file.sync();
    } finally {
      await file.close();
    }
  } finally {
    await folder.close();
  }
}
```

## packages/adapters/shell/rc/src/files/powershell-profile.ts :: powerShellProfile

PENDING

Ordered steps, including branches:

```ts
export function powerShellProfile(
  run = execTrustedSync,
  home = homedir(),
  platform = process.platform,
): string | undefined {
  const candidates: string[] = [];

  for (const shell of ["pwsh", "powershell"]) {
    try {
      const path = run(
        shell,
        ["-NoProfile", "-NonInteractive", "-Command", "$PROFILE.CurrentUserCurrentHost"],
        { timeout: 5000 },
      ).replace(/\r?\n$/, "");

      if (
        isAbsolute(path) &&
        basename(path) === "Microsoft.PowerShell_profile.ps1" &&
        !Array.from(path).some((character) => {
          const code = character.charCodeAt(0);

          return code < 32 || (code >= 127 && code <= 159);
        })
      )
        candidates.push(path);
    } catch {
      continue;
    }
  }

  const defaults =
    platform === "win32"
      ? [
          join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
          join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
        ]
      : [join(home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1")];

  return [...candidates, ...defaults].find(hasHook) ?? candidates[0];
}
```

## packages/adapters/shell/rc/src/files/powershell-profile.ts :: hasHook

PENDING

Ordered steps, including branches:

```ts
function hasHook(path: string) {
  try {
    return readFileSync(path, "utf8").includes(start);
  } catch {
    return false;
  }
}
```

## packages/adapters/keychain/file/src/failure.ts :: keychainFailure

PENDING

Ordered steps, including branches:

```ts
export function keychainFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("LOCKED", "Key storage operation failed", { cause });
}
```

## packages/adapters/keychain/file/src/adapter.ts :: createFileKeychainAdapter

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function createFileKeychainAdapter(options: IOptions): IKeychainAdapter {
  const directory = join(options.home, "state", "keys");

  const path = (name: string) =>
    join(directory, `${createHash("sha256").update(name).digest("hex")}.key`);

  const get = async (name: string, required = false) => {
    const value = await readKeyFile(path(name));

    if (value === undefined && required)
      throw new EnvdenError(
        "LOCKED",
        "No vault keys are stored on this device. If it was in the vault before, run envden join",
      );

    return value;
  };

  return {
    id: "file",
    ownerOnly: () => ownerOnly(directory).catch(keychainFailure),
    get: (name, required) => get(name, required).catch(keychainFailure),
    set: (name, value) => writeKeyFile(path(name), value).catch(keychainFailure),
    delete: (name) => removeKeyFile(path(name)).catch(keychainFailure),
  };
}
```

## packages/adapters/keychain/file/src/files/source.ts :: readKeyFile

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function readKeyFile(path: string): Promise<Uint8Array | undefined> {
  const file = await open(path, "r").catch((error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  });

  if (!file) return undefined;

  try {
    if (process.platform !== "win32" && (await file.stat()).mode & 0o077)
      throw new EnvdenError("INVALID_DATA", "Key file is accessible to other users");

    return new Uint8Array(await file.readFile());
  } finally {
    await file.close();
  }
}
```

## packages/adapters/keychain/file/src/files/source.ts :: writeKeyFile

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function writeKeyFile(path: string, value: Uint8Array) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await restrictAccess(directory, true);
  const temporary = join(directory, `${crypto.randomUUID()}.tmp`);

  try {
    const file = await open(temporary, "wx", 0o600);

    try {
      await restrictAccess(temporary);
      await file.writeFile(value);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);
    await syncDirectory(directory);
  } finally {
    await rm(temporary, { force: true });
  }
}
```

## packages/adapters/keychain/file/src/files/source.ts :: removeKeyFile

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function removeKeyFile(path: string) {
  await rm(path, { force: true });

  await syncDirectory(dirname(path)).catch((error: unknown) => {
    if (!missing(error)) throw error;
  });
}
```

## packages/adapters/keychain/file/src/files/source.ts :: missing

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function missing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
```

## packages/adapters/keychain/file/src/files/source.ts :: syncDirectory

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function syncDirectory(path: string) {
  if (process.platform === "win32") return;
  const directory = await open(path, "r");

  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
```

## packages/adapters/keychain/file/src/files/owner-only.ts :: ownerOnly

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export async function ownerOnly(directory: string): Promise<boolean> {
  if (process.platform === "win32") return true;

  const entries = await readdir(directory).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });

  if (!entries) return true;

  const paths = [directory, ...entries.map((entry) => join(directory, entry))];
  const modes = await Promise.all(paths.map(async (path) => (await stat(path)).mode));

  return modes.every((mode) => (mode & 0o077) === 0);
}
```

## packages/adapters/network/tailscale/src/adapter.ts :: run

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
async function run(args: string[]): Promise<ICommandResult> {
  const child = spawnTrusted("tailscale", args, { stdout: "pipe", stderr: "pipe" });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { stdout, stderr, exitCode };
}
```

## packages/adapters/network/tailscale/src/adapter.ts :: unavailable

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function unavailable(kind: INetworkProblem["kind"]): INetworkStatus {
  return {
    ready: false,
    running: false,
    loggedIn: false,
    httpsEnabled: false,
    problem: tailscaleProblem(kind),
  };
}

// Tailscale's own output holds the next step, such as the link to enable Serve.
```

## packages/adapters/network/tailscale/src/adapter.ts :: failure

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function failure(summary: string, stderr: string, cause?: unknown) {
  const detail = stderr.trim().slice(0, STDERR_LIMIT);

  return new EnvdenError("INTERNAL", detail ? `${summary}: ${detail}` : summary, { cause });
}

class TailscaleAdapter implements INetworkAdapter {
  readonly id = "tailscale";

  private readonly runner: TRunner;

  constructor(runner: TRunner = run) {
    this.runner = runner;
  }

  async status(): Promise<INetworkStatus> {
    const result = await this.runner(["status", "--json"]).catch(() => undefined);
    if (!result) return unavailable("not-installed");

    if (result.exitCode !== 0) return unavailable("not-running");

    try {
      return parseStatus(result.stdout);
    } catch {
      return unavailable("unreadable");
    }
  }

  async checkHttpsCertificate(): Promise<THttpsCheck> {
    return (await this.status()).problem ?? { kind: "ready" };
  }

  private async command(args: string[], summary: string) {
    const result = await this.runner(args).catch((cause: unknown) => {
      throw failure(summary, "", cause);
    });

    if (result.exitCode !== 0) throw failure(summary, result.stderr);

    return result.stdout;
  }

  async expose(port: number): Promise<string> {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new EnvdenError("INVALID_INPUT", "Invalid port");

    const status = await this.status();

    if (status.problem || !status.hostname)
      throw new EnvdenError("CONFLICT", status.problem?.message ?? "Tailscale is not ready");

    const target = `http://127.0.0.1:${port}`;

    const current = await this.command(
      ["serve", "status", "--json"],
      "Tailscale serve status failed",
    );

    if (serveConflict(current, status.hostname, port, target))
      throw new EnvdenError(
        "CONFLICT",
        `Tailscale already serves something else on port ${port}. See it with tailscale serve status, and remove it with tailscale serve --https=${port} off`,
      );

    await this.command(["serve", "--bg", `--https=${port}`, target], "Tailscale serve failed");

    return `https://${status.hostname}:${port}`;
  }
}
```

## packages/adapters/network/tailscale/src/adapter.ts :: createTailscaleNetworkAdapter

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function createTailscaleNetworkAdapter(runner?: TRunner): INetworkAdapter {
  return new TailscaleAdapter(runner);
}
```

## packages/adapters/network/tailscale/src/status/parse.ts :: parseStatus

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function parseStatus(stdout: string): INetworkStatus {
  const result = statusSchema.safeParse(JSON.parse(stdout));
  if (!result.success) throw new EnvdenError("INVALID_DATA", "Invalid Tailscale status");

  const { BackendState: state, Self: self, CertDomains: domains } = result.data;
  const running = state === "Running";
  const loggedIn = !["NeedsLogin", "NoState"].includes(state);
  const dns = self?.DNSName.replace(/\.$/, "");
  const httpsEnabled = domains.some((name) => name === dns);
  const problem = statusProblem({ running, loggedIn, httpsEnabled });

  return {
    ready: !problem,
    running,
    loggedIn,
    httpsEnabled,
    hostname: dns,
    ...(problem ? { problem } : {}),
  };
}
```

## packages/adapters/network/tailscale/src/status/problem.ts :: tailscaleProblem

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function tailscaleProblem(kind: INetworkProblem["kind"]): INetworkProblem {
  return { kind, message: messages[kind] };
}
```

## packages/adapters/network/tailscale/src/status/problem.ts :: statusProblem

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function statusProblem(state: {
  running: boolean;
  loggedIn: boolean;
  httpsEnabled: boolean;
}): INetworkProblem | undefined {
  if (!state.loggedIn) return tailscaleProblem("logged-out");

  if (!state.running) return tailscaleProblem("not-running");

  if (!state.httpsEnabled) return tailscaleProblem("https-disabled");

  return undefined;
}
```

## packages/adapters/network/tailscale/src/serve/conflict.ts :: parseServe

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function parseServe(stdout: string) {
  try {
    return serveSchema.parse(JSON.parse(stdout.trim() || "{}") ?? {});
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid Tailscale serve status", { cause });
  }
}

// True when this machine's `port` already serves anything other than `target` at `/`.
```

## packages/adapters/network/tailscale/src/serve/conflict.ts :: serveConflict

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function serveConflict(
  stdout: string,
  hostname: string,
  port: number,
  target: string,
): boolean {
  const { TCP: tcp = {}, Web: web = {} } = parseServe(stdout);
  const listener = tcp[String(port)];
  const site = web[`${hostname}:${port}`];
  if (!listener && !site) return false;

  if (listener?.TCPForward || !site) return true;

  const handlers = Object.entries(site.Handlers);

  return !(handlers.length === 1 && handlers[0]![0] === "/" && handlers[0]![1].Proxy === target);
}
```

## packages/adapters/placement/fs/src/adapter.ts :: createFsPlacementAdapter

PENDING

Ordered steps, including branches:

```ts
export function createFsPlacementAdapter(
  mode: TPlacementMode,
  checkoutRoot: string,
  backupDirectory: string | undefined,
  now: () => number,
): IPlacementAdapter {
  const root = resolve(checkoutRoot);

  return {
    mode,
    supported: (dir) => supported(mode, dir).catch(placementFailure),
    place: (storePath, checkoutPath, prepareTemporary, replacingLink) =>
      place(
        mode,
        root,
        storePath,
        checkoutPath,
        backupDirectory,
        undefined,
        prepareTemporary,
        now,
        replacingLink,
      ).catch(placementFailure),
    remove: (storePath, checkoutPath) =>
      remove(root, storePath, checkoutPath).catch(placementFailure),
    inspect: (storePath, checkoutPath) =>
      inspect(mode, root, storePath, checkoutPath).catch(placementFailure),
  };
}
```

## packages/adapters/placement/fs/src/failures/operation.ts :: placementFailure

PENDING

Ordered steps, including branches:

```ts
export function placementFailure(cause: unknown): never {
  if (cause instanceof EnvdenError) throw cause;

  throw new EnvdenError("CONFLICT", "Placement operation failed", { cause });
}
```

## packages/adapters/placement/fs/src/native/directory.ts :: openParent

PENDING

Ordered steps, including branches:

```ts
export function openParent(root: string, path: string, create = true) {
  let fd = checked(libc!.symbols.open(cstring(root), directoryFlags, 0));

  try {
    for (const part of path.split("/").slice(0, -1)) {
      if (create) libc!.symbols.mkdirat(fd, cstring(part), 0o700);
      const next = libc!.symbols.openat(fd, cstring(part), directoryFlags, 0, 0, 0, 0, 0, 0);

      if (next < 0 && !create && libc!.errno() === 2)
        throw new EnvdenError("NOT_FOUND", "Checkout parent is missing");

      checked(next);
      closeSync(fd);
      fd = next;
    }

    return fd;
  } catch (cause) {
    closeSync(fd);
    if (cause instanceof EnvdenError && cause.code === "NOT_FOUND") throw cause;
    throw new EnvdenError("CONFLICT", "Unsafe checkout parent", { cause });
  }
}
```

## packages/adapters/placement/fs/src/native/directory.ts :: readAt

PENDING

Ordered steps, including branches:

```ts
export function readAt(fd: number, name: string) {
  const source = openAt(fd, name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    if (!fstatSync(source).isFile())
      throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

    return readFileSync(source);
  } finally {
    closeSync(source);
  }
}
```

## packages/adapters/placement/fs/src/native/directory.ts :: writeAt

PENDING

Ordered steps, including branches:

```ts
export function writeAt(fd: number, name: string, contents: Uint8Array) {
  const file = openAt(
    fd,
    name,
    constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY,
    0o600,
  );

  try {
    let offset = 0;

    while (offset < contents.length) {
      const written = writeSync(file, contents, offset, contents.length - offset);
      if (!written) throw new EnvdenError("CONFLICT", "Placement write failed");
      offset += written;
    }

    fsyncSync(file);
  } finally {
    closeSync(file);
  }
}
```

## packages/adapters/placement/fs/src/native/directory.ts :: linkTarget

PENDING

Ordered steps, including branches:

```ts
export function linkTarget(fd: number, name: string) {
  const buffer = Buffer.alloc(4096);
  const length = Number(libc!.symbols.readlinkat(fd, cstring(name), buffer, buffer.length));

  return length < 0 ? undefined : buffer.subarray(0, length).toString();
}
```

## packages/adapters/placement/fs/src/native/directory.ts :: assertIdentity

PENDING

Ordered steps, including branches:

```ts
export function assertIdentity(fd: number, name: string, before: Buffer | undefined) {
  const current = identity(fd, name);

  if (before === undefined ? current !== undefined : !current?.equals(before))
    throw new EnvdenError("CONFLICT", "Placement entry changed");
}
```

## packages/adapters/placement/fs/src/native/stat.ts :: statSymbol

PENDING

Ordered steps, including branches:

```ts
export function statSymbol(
  available: readonly string[],
  platform: NodeJS.Platform,
  arch: string,
): { name: string; version?: number } | undefined {
  const name = platform === "darwin" && arch === "x64" ? "fstatat$INODE64" : "fstatat";
  if (available.includes(name)) return { name };
  if (platform !== "linux" || !available.includes("__fxstatat")) return undefined;
  if (arch === "x64") return { name: "__fxstatat", version: 1 };
  if (arch === "arm64") return { name: "__fxstatat", version: 0 };

  return undefined;
}
```

## packages/adapters/placement/fs/src/native/remove.ts :: removeNative

PENDING

Ordered steps, including branches:

```ts
export function removeNative(
  root: string,
  path: string,
  storePath: string | undefined,
  beforeUnlink?: () => void,
) {
  const fd = openParent(root, path, false);
  const name = basename(path);

  try {
    const before = identity(fd, name);
    if (!before) return;
    const target = linkTarget(fd, name);

    if (target !== undefined) {
      if (!storePath || !sameTarget(resolve(root, dirname(path), target), storePath))
        throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");
    } else readAt(fd, name);

    assertIdentity(fd, name, before);
    beforeUnlink?.();
    checked(libc!.symbols.unlinkat(fd, cstring(name), 0));
  } finally {
    closeSync(fd);
  }
}
```

## packages/adapters/placement/fs/src/native/place.ts :: placeNative

PENDING

Ordered steps, including branches:

```ts
export function placeNative(
  mode: TPlacementMode,
  root: string,
  path: string,
  storePath: string,
  beforeRename: (() => void) | undefined,
  backupDirectory: string | undefined,
  now: () => number,
  replacingLink?: string,
) {
  const fd = openParent(root, path);
  const name = basename(path);
  const temporary = temporaryName(path);
  let staged: Buffer | undefined;

  try {
    const before = identity(fd, name);
    let previous: Buffer | undefined;

    if (before) {
      const target = linkTarget(fd, name);

      if (
        target !== undefined &&
        target !== replacingLink &&
        !sameTarget(resolve(root, dirname(path), target), storePath)
      )
        throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");

      if (target === undefined) previous = readAt(fd, name);
    }

    const contents = readStore(storePath);
    if (identity(fd, temporary)) checked(libc!.symbols.unlinkat(fd, cstring(temporary), 0));

    if (mode === "link")
      checked(libc!.symbols.symlinkat(cstring(resolve(storePath)), fd, cstring(temporary)));
    else writeAt(fd, temporary, contents);

    staged = identity(fd, temporary);
    assertIdentity(fd, name, before);

    if (previous && !previous.equals(contents))
      backupContents(root, backupDirectory, previous, undefined, now);

    assertIdentity(fd, name, before);
    assertIdentity(fd, temporary, staged);
    beforeRename?.();
    checked(libc!.symbols.renameat(fd, cstring(temporary), fd, cstring(name)));
  } finally {
    try {
      if (staged && identity(fd, temporary)?.equals(staged))
        checked(libc!.symbols.unlinkat(fd, cstring(temporary), 0));
    } finally {
      closeSync(fd);
    }
  }
}
```

## packages/adapters/placement/fs/src/native/place.ts :: readStore

PENDING

Ordered steps, including branches:

```ts
function readStore(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    if (!fstatSync(fd).isFile())
      throw new EnvdenError("INVALID_INPUT", "Store source is not a regular file");

    fchmodSync(fd, 0o600);

    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
```

## packages/adapters/placement/fs/src/paths/validate-pulled-path.ts :: validatePulledPath

PENDING

Ordered steps, including branches:

```ts
export function validatePulledPath(path: string): string {
  if (/\p{Cf}/u.test(path)) throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return validateLocalPath(path);
}
```

## packages/adapters/placement/fs/src/paths/validate-pulled-path.ts :: validateLocalPath

PENDING

Ordered steps, including branches:

```ts
export function validateLocalPath(path: string): string {
  validatePath(path);

  if (path.split("/").some((part) => part.toLowerCase() === ".git" || /~[0-9]+(?:\.|$)/.test(part)))
    throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return path;
}
```

## packages/adapters/placement/fs/src/paths/temporary.ts :: temporaryName

PENDING

Ordered steps, including branches:

```ts
export function temporaryName(path: string) {
  return `.envden-${createHash("sha256").update(path).digest("hex")}`;
}
```

## packages/adapters/placement/fs/src/paths/temporary.ts :: prepareTemporaryFile

PENDING

Ordered steps, including branches:

```ts
export async function prepareTemporaryFile(
  mode: TPlacementMode,
  path: string,
  prepare?: (path: string) => Promise<void>,
) {
  if (mode !== "copy") return;

  if (!prepare)
    throw new EnvdenError("INVALID_INPUT", "Copy placement requires a temporary file exclude");

  await prepare(posix.join(posix.dirname(path), temporaryName(path)));
}
```

## packages/adapters/placement/fs/src/paths/safe-parents.ts :: safeParents

PENDING

Ordered steps, including branches:

```ts
export async function safeParents(root: string, path: string): Promise<void> {
  const rootStat = await lstat(root);

  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe checkout root");

  let current = root;

  for (const part of path.split("/").slice(0, -1)) {
    current = join(current, part);
    let stat = await statOrMissing(current);

    if (!stat) stat = await createParent(current);

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe checkout parent");
  }
}
```

## packages/adapters/placement/fs/src/paths/safe-parents.ts :: createParent

PENDING

Ordered steps, including branches:

```ts
async function createParent(current: string) {
  try {
    await mkdir(current, { mode: 0o700 });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
      throw error;
  }

  return lstat(current);
}
```

## packages/adapters/placement/fs/src/paths/parent-identity.ts :: parentIdentity

PENDING

Ordered steps, including branches:

```ts
export async function parentIdentity(root: string, destination: string) {
  const realRoot = await realpath(root);
  const path = relative(root, dirname(destination));
  const parents = [];
  let current = root;

  for (const part of ["", ...path.split(sep).filter(Boolean)]) {
    current = join(current, part);
    const stat = await lstat(current);

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("CONFLICT", "Unsafe checkout parent");

    parents.push({ path: current, dev: stat.dev, ino: stat.ino });
  }

  return { realRoot, parents };
}
```

## packages/adapters/placement/fs/src/paths/parent-identity.ts :: verifyParents

PENDING

Ordered steps, including branches:

```ts
export async function verifyParents(
  snapshot: Awaited<ReturnType<typeof parentIdentity>>,
  destination: string,
) {
  for (const parent of snapshot.parents) {
    const stat = await lstat(parent.path);

    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== parent.dev ||
      stat.ino !== parent.ino
    )
      throw new EnvdenError("CONFLICT", "Checkout parent changed");
  }

  const path = relative(snapshot.realRoot, await realpath(dirname(destination)));

  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
    throw new EnvdenError("CONFLICT", "Checkout parent escaped root");
}
```

## packages/adapters/placement/fs/src/paths/checkout-relative.ts :: checkoutRelative

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function checkoutRelative(root: string, path: string): string {
  if (path.split(/[\\/]/).includes(".."))
    throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return validateLocalPath(relative(root, resolve(path)).split("\\").join("/"));
}
```

## packages/adapters/placement/fs/src/paths/same-target.ts :: sameTarget

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
export function sameTarget(target: string, storePath: string): boolean {
  if (resolve(target) === resolve(storePath)) return true;
  const real = realOrMissing(target);

  return real !== undefined && real === realOrMissing(storePath);
}
```

## packages/adapters/placement/fs/src/paths/same-target.ts :: realOrMissing

COMPARED - see unresolved observations in observations.md; completion is not claimed.

Ordered steps, including branches:

```ts
function realOrMissing(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}
```

## packages/adapters/placement/fs/src/operations/stat.ts :: statOrMissing

PENDING

Ordered steps, including branches:

```ts
export async function statOrMissing(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return undefined;

    throw error;
  }
}
```

## packages/adapters/placement/fs/src/operations/supported.ts :: supported

PENDING

Ordered steps, including branches:

```ts
export async function supported(mode: TPlacementMode, dir: string): Promise<boolean> {
  if (mode === "copy") return true;
  const probe = join(dir, `.envden-probe-${randomUUID()}`);

  try {
    await symlink(".envden-probe-target", probe);

    return true;
  } catch {
    return false;
  } finally {
    await rm(probe, { force: true });
  }
}
```

## packages/adapters/placement/fs/src/operations/inspect.ts :: inspect

PENDING

Ordered steps, including branches:

```ts
export async function inspect(
  mode: TPlacementMode,
  root: string,
  storePath: string,
  checkoutPath: string,
): ReturnType<IPlacementAdapter["inspect"]> {
  const path = checkoutRelative(root, checkoutPath);
  const rootStat = await lstat(root);

  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe checkout root");

  // Inspect parents without creating missing checkout folders.
  let parent = root;

  for (const part of path.split("/").slice(0, -1)) {
    parent = join(parent, part);
    const stat = await statOrMissing(parent);
    if (!stat) return "missing";

    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe checkout parent");
  }

  const stat = await statOrMissing(checkoutPath);
  if (!stat) return "missing";

  if (stat.isSymbolicLink())
    return (await isStoreLink(storePath, checkoutPath)) ? "linked" : "detached";

  if (!stat.isFile()) return "detached";

  return inspectRegular(mode, storePath, checkoutPath);
}
```

## packages/adapters/placement/fs/src/operations/inspect.ts :: inspectRegular

PENDING

Ordered steps, including branches:

```ts
async function inspectRegular(mode: TPlacementMode, storePath: string, checkoutPath: string) {
  if (!(await statOrMissing(storePath))) return "detached";

  const matches = (await readFile(checkoutPath)).equals(await readFile(storePath));
  if (!matches) return "detached";

  return mode === "link" ? "relinkable" : "linked";
}
```

## packages/adapters/placement/fs/src/operations/remove.ts :: remove

PENDING

Ordered steps, including branches:

```ts
export async function remove(
  root: string,
  storePath: string | undefined,
  checkoutPath: string,
  runtime = { platform: process.platform, libc },
) {
  const path = checkoutRelative(root, checkoutPath);

  if (runtime.libc) {
    // Missing parents need no creation; unsafe existing parents must still fail.
    if (!(await statOrMissing(root))) return;

    try {
      removeNative(root, path, storePath);
    } catch (cause) {
      if (cause instanceof EnvdenError && cause.code === "NOT_FOUND") return;
      throw cause;
    }

    return;
  }

  await removeFallback(root, storePath, checkoutPath);
}
```

## packages/adapters/placement/fs/src/operations/remove.ts :: removeFallback

PENDING

Ordered steps, including branches:

```ts
async function removeFallback(root: string, storePath: string | undefined, checkoutPath: string) {
  const parents = await removalParents(root, checkoutPath);
  if (!parents) return;
  const existing = await statOrMissing(checkoutPath);
  if (!existing) return;

  if (existing.isSymbolicLink()) {
    if (!storePath || !(await isStoreLink(storePath, checkoutPath)))
      throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");
  } else if (!existing.isFile())
    throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

  await verifyParents(parents, checkoutPath);
  await unlink(checkoutPath);
}
```

## packages/adapters/placement/fs/src/operations/remove.ts :: removalParents

PENDING

Ordered steps, including branches:

```ts
async function removalParents(root: string, path: string) {
  try {
    return await parentIdentity(root, path);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
}
```

## packages/adapters/placement/fs/src/operations/place.ts :: place

PENDING

Ordered steps, including branches:

```ts
export async function place(
  mode: TPlacementMode,
  root: string,
  storePath: string,
  checkoutPath: string,
  backupDirectory: string | undefined,
  runtime = { platform: process.platform, libc },
  prepareTemporary: ((path: string) => Promise<void>) | undefined,
  now: () => number,
  replacingLink?: string,
): Promise<void> {
  const path = validatePulledPath(checkoutRelative(root, checkoutPath));

  await prepareTemporaryFile(mode, path, prepareTemporary);

  if (runtime.libc) {
    placeNative(mode, root, path, storePath, undefined, backupDirectory, now, replacingLink);

    return;
  }

  await safeParents(root, path);
  const destination = resolve(checkoutPath);
  const parents = await parentIdentity(root, destination);
  const existing = await statOrMissing(destination);

  if (
    existing?.isSymbolicLink() &&
    !(await isStoreLink(storePath, destination)) &&
    (replacingLink === undefined || (await readlink(destination)) !== replacingLink)
  )
    throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");

  if (existing && !existing.isFile() && !existing.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

  const storeStat = await lstat(storePath);

  if (!storeStat.isFile() || storeStat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Store source is not a regular file");

  await restrictAccess(storePath);
  const temporary = join(dirname(destination), temporaryName(path));

  await rm(temporary, { force: true });

  let staged;

  try {
    if (mode === "link") {
      await symlink(resolve(storePath), temporary);
      staged = await lstat(temporary);
    } else {
      const file = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );

      try {
        staged = await file.stat();
        await restrictAccess(temporary);
        await verifyParents(parents, destination);
        const source = await open(storePath, constants.O_RDONLY | constants.O_NOFOLLOW);

        try {
          await file.writeFile(await source.readFile());
        } finally {
          await source.close();
        }
      } finally {
        await file.close();
      }
    }

    await verifyParents(parents, destination);
    await backupDestination(root, backupDirectory, destination, existing, storePath, parents, now);
    await verifyParents(parents, destination);

    if (!sameIdentity(existing, await statOrMissing(destination)))
      throw new EnvdenError("CONFLICT", "Destination changed during placement");

    const current = await lstat(temporary);

    if (staged?.dev !== current.dev || staged.ino !== current.ino)
      throw new EnvdenError("CONFLICT", "Staged file changed");

    // Windows: parent replacement after this check remains possible.
    await rename(temporary, destination);
  } finally {
    const leftover = await statOrMissing(temporary);

    if (staged && leftover?.dev === staged.dev && leftover.ino === staged.ino)
      await rm(temporary, { force: true });
  }
}
```

## packages/adapters/placement/fs/src/operations/place.ts :: sameIdentity

PENDING

Ordered steps, including branches:

```ts
function sameIdentity(
  before: Awaited<ReturnType<typeof statOrMissing>>,
  after: Awaited<ReturnType<typeof statOrMissing>>,
) {
  if (!before || !after) return before === after;

  return (["dev", "ino", "size", "mtimeMs", "ctimeMs"] as const).every(
    (key) => before[key] === after[key],
  );
}
```

## packages/adapters/placement/fs/src/operations/place.ts :: backupDestination

PENDING

Ordered steps, including branches:

```ts
async function backupDestination(
  root: string,
  backupDirectory: string | undefined,
  destination: string,
  existing: Awaited<ReturnType<typeof statOrMissing>>,
  storePath: string,
  parents: Awaited<ReturnType<typeof parentIdentity>>,
  now: () => number,
) {
  if (!existing) return;

  const source = await open(
    existing.isSymbolicLink() ? storePath : destination,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );

  try {
    if (!existing.isSymbolicLink() && !sameIdentity(existing, await source.stat()))
      throw new EnvdenError("CONFLICT", "Destination changed before backup");

    const contents = await source.readFile();
    const store = await open(storePath, constants.O_RDONLY | constants.O_NOFOLLOW);

    try {
      await verifyParents(parents, destination);

      if (!contents.equals(await store.readFile()))
        backupContents(root, backupDirectory, contents, undefined, now);
    } finally {
      await store.close();
    }
  } finally {
    await source.close();
  }
}
```

## packages/adapters/placement/fs/src/operations/link.ts :: isStoreLink

PENDING

Ordered steps, including branches:

```ts
export async function isStoreLink(storePath: string, checkoutPath: string): Promise<boolean> {
  return sameTarget(resolve(dirname(checkoutPath), await readlink(checkoutPath)), storePath);
}
```

## packages/adapters/placement/fs/src/backups/prune-at.ts :: pruneAt

PENDING

Ordered steps, including branches:

```ts
export function pruneAt(fd: number, name: string) {
  const before = identity(fd, name);
  if (!before) return;
  const link = Buffer.alloc(1);
  if (Number(libc!.symbols.readlinkat(fd, cstring(name), link, 1)) >= 0) return;
  const file = openAt(fd, name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    const stat = fstatSync(file);
    if (!stat.isFile()) return;
    assertIdentity(fd, name, before);
    checked(libc!.symbols.unlinkat(fd, cstring(name), 0));
  } finally {
    closeSync(file);
  }
}
```

## packages/adapters/placement/fs/src/backups/prune.ts :: pruneBackups

PENDING

Ordered steps, including branches:

```ts
export async function pruneBackups(dir: string, now: number, maxAgeDays = 30): Promise<void> {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeDays) || maxAgeDays < 0)
    throw new EnvdenError("INVALID_INPUT", "Invalid backup retention");

  const directory = await statOrMissing(dir);
  if (!directory) return;

  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe backup directory");

  const cutoff = now - maxAgeDays * 86400000;
  const fd = libc ? openParent(dir, ".entry", false) : undefined;

  try {
    for (const name of await readdir(dir)) {
      const match = /^\.envden-backup-(\d+)-[0-9a-f-]{36}$/.exec(name);
      if (!match || Number(match[1]) >= cutoff) continue;

      if (fd !== undefined) pruneAt(fd, name);
      else await pruneWindows(join(dir, name));
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
```

## packages/adapters/placement/fs/src/backups/prune.ts :: pruneWindows

PENDING

Ordered steps, including branches:

```ts
async function pruneWindows(path: string) {
  const stat = await statOrMissing(path);

  if (stat?.isFile() && !stat.isSymbolicLink())
    await unlink(path).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    });
}
```

## packages/adapters/placement/fs/src/backups/write.ts :: backupContents

PENDING

Ordered steps, including branches:

```ts
export function backupContents(
  root: string,
  directory: string | undefined,
  contents: Uint8Array,
  runtime = {
    libc,
    spawn: (args: string[]) => spawnTrusted("icacls", args, { sync: true }).exitCode,
  },
  now: () => number,
) {
  if (!directory) throw new EnvdenError("INVALID_INPUT", "Backup directory is required");
  const path = resolve(directory);
  assertOutside(root, path);

  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertOutside(realpathSync(root), realpathSync(path));
  const name = `.envden-backup-${now()}-${randomUUID()}`;

  if (runtime.libc) {
    const fd = openParent(path, name, false);

    try {
      fchmodSync(fd, 0o700);
      writeAt(fd, name, contents);
    } finally {
      closeSync(fd);
    }
  } else {
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe backup directory");

    chmodSync(path, 0o700);

    const result = runtime.spawn([
      path,
      "/inheritance:r",
      "/grant:r",
      `${userInfo().username}:(OI)(CI)F`,
    ]);

    if (result !== 0) throw new EnvdenError("INVALID_INPUT", "Could not restrict backup access");

    writeFileSync(join(path, name), contents, { flag: "wx", mode: 0o600 });
  }
}
```

## packages/adapters/placement/fs/src/backups/write.ts :: assertOutside

PENDING

Ordered steps, including branches:

```ts
function assertOutside(root: string, path: string) {
  if (placeInRoot(root, path) !== "outside")
    throw new EnvdenError("INVALID_INPUT", "Backup directory must be outside checkout");
}
```
