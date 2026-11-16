# Links and CLI/UI faithfulness sweep

## apps/cli/src/links/approval.ts :: checkoutApproval

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared ordered TS steps below against Rust.

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

DONE: Normalized unresolved foreign targets and canonicalized home for deleted-copy notice; c941813f.

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

DONE: compared ordered TS steps below against Rust.

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

DONE: Handles read-after-lstat ENOENT as absent; 88ab94a0.

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

DONE: compared ordered TS steps below against Rust.

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

DONE: compared ordered TS steps below against Rust.

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

DONE: compared ordered TS steps below against Rust.

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

DONE: compared ordered TS steps below against Rust.

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

DONE: compared ordered TS steps below against Rust.

Ordered steps, including branches:

```ts
export function markLocalOnly(...args: Parameters<typeof lockedmarkLocalOnly>) {
  return withStateLock(args[0].home, () => lockedmarkLocalOnly(...args));
}
```

## apps/cli/src/links/fork.ts :: shouldAskAlias

DONE: compared ordered TS steps below against Rust.

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

PENDING: Rust onboarding/scan.rs uses checkpoint_material rather than syncContext. Requires request-order trace in onboarding owner.

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

DONE: compared ordered TS steps below against Rust.

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

DONE: compared ordered TS steps below against Rust.

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

DONE: compared ordered TS steps below against Rust.

Ordered steps, including branches:

```ts
export function deriveAlias(aliases: Record<string, string>, source: string, target: string) {
  if (!source || !target || source === target) return { kind: "invalid" } as const;
  if (aliases[target] || Object.values(aliases).includes(source)) return { kind: "chain" } as const;

  return { kind: "assign" } as const;
}
```

## apps/cli/src/links/alias.ts :: aliasRepo

DONE: compared ordered TS steps below against Rust.

Ordered steps, including branches:

```ts
export function aliasRepo(...args: Parameters<typeof lockedAliasRepo>) {
  return withStateLock(args[0].home, () => lockedAliasRepo(...args));
}
```

## apps/cli/src/links/place.ts :: lockedlinkCheckout

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
export function linkCheckout(...args: Parameters<typeof lockedlinkCheckout>) {
  return withStateLock(args[0].home, () => lockedlinkCheckout(...args));
}
```

## apps/cli/src/links/discovery/identify.ts :: identify

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
export function projectFolder(names: string[]) {
  return names.some((name) => manifests.has(name));
}
```

## apps/cli/src/links/discovery/repos.ts :: discoverRepos

PENDING: LocaleCompare ordering and callback/request order still differ.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: Insert checkout/report progress before worktree and submodule reads; fixture regression; discovery-order commit.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
function listed(list: () => Promise<string[]>) {
  return list().catch((): string[] => []);
}
```

## apps/cli/src/links/discovery/repos.ts :: add

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
function add(walk: IWalk, checkout: ICheckout) {
  walk.found.set(checkout.root, checkout);
  walk.events.progress?.(walk.found.size);
}
```

## apps/cli/src/links/discovery/repos.ts :: report

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
function report(walk: IWalk) {
  return walk.events.report ?? (() => {});
}
```

## apps/cli/src/links/discovery/repos.ts :: unseen

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
function unseen(walk: IWalk, real: string) {
  return !walk.visited.has(real) && !excludedPath(real, walk.excludes);
}
```

## apps/cli/src/links/discovery/repos.ts :: excludedPath

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
function excludedPath(path: string, excludes: string[]) {
  return excludes.some((excluded) => placeInRoot(excluded, path) !== "outside");
}
```

## apps/cli/src/links/discovery/repos.ts :: realOrResolved

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
function realOrResolved(path: string) {
  return realpath(path).catch(() => resolve(path));
}

// the entry's own name decides, so a visible link to ~/.projects is walked
```

## apps/cli/src/links/discovery/repos.ts :: canDescend

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
function canDescend(entry: Dirent, place: IFolderPlace) {
  return (entry.isDirectory() || entry.isSymbolicLink()) && !skippedFolder(entry.name, place);
}
```

## apps/cli/src/links/discovery/repos.ts :: isCheckout

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
async function isCheckout(path: string) {
  const entries = await readdir(path).catch((): string[] => []);

  return entries.includes(".git");
}
```

## apps/cli/src/links/checkout/bases.ts :: removeCheckoutBases

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
export function worktreeApprovedNotice(checkout: ICheckout) {
  return sanitizeTerminal(`Approved worktree ${checkout.root} (auto-approve-worktrees)`);
}
```

## apps/cli/src/links/checkout/worktree.ts :: approvedClone

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
function repoOf(state: ILocalState, checkout: ICheckout) {
  return state.aliases[checkout.repoId] ?? checkout.repoId;
}
```

## apps/cli/src/links/checkout/repo.ts :: checkoutRepo

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
export function checkoutRepo(state: ILocalState, root: string) {
  const approved = state.approved.find((item) => item.root === root);

  return approved && (state.aliases[approved.repoId] ?? approved.repoId);
}
```

## apps/cli/src/links/checkout/supported.ts :: supportedPlacement

DONE: Shared copy confirmation defaults no, matching TS consent default.

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

DONE: Shared default-no consent and reuse captured config for placement setting.

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

DONE: Compose matcher rejects ECMAScript line terminators; red-mode.log and green-mode-direct.log.

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

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
export function siblingLink(own: IOwnLink, envFiles: string[]) {
  const destination = join(own.checkout.root, own.path);
  const target = relative(own.checkout.root, resolve(dirname(destination), own.link));

  return envFiles.includes(target.split(sep).join("/"));
}
```

## apps/cli/src/links/takeover/target.ts :: regularTarget

DONE: compared ordered TS steps below against Rust.

Ordered steps, including branches:

```ts
export async function regularTarget(path: string) {
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}
```

## apps/cli/src/links/takeover/target.ts :: readTarget

DONE: compared ordered TS steps below against Rust.

Ordered steps, including branches:

```ts
export async function readTarget(path: string) {
  return (await regularTarget(path)) ? readFile(path).catch(() => undefined) : undefined;
}
```

## apps/cli/src/links/takeover/group.ts :: groupOwnLinks

PENDING: Rust BTreeMap byte order differs from localeCompare.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

PENDING: Rust byte order differs from localeCompare.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

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

DONE: compared the ordered TS body below with its Rust counterpart.

Ordered steps, including branches:

```ts
async function askInTerminal(question: string) {
  return !!process.stdin.isTTY && consent(question, true);
}
```

## Additional confirmed gaps and regression evidence

- output/telemetry/background.childEnvironment: DONE; restrict home pass-through to ENVDEN_HOME; preserve upper/lower network names. red-telemetry.log.
- settings/config.readConfig: DONE; read bytes, UTF8 replacement, JSON parse, schema validation; ENOENT defaults; fixed errors with sources. red-config.log.
- commands/maintenance/update action: DONE; capture injected clock before post-install guard; refresh or check/self-update; JSON. red-clock-direct.log.
- ui/server/app.createDashboardApp guards: DONE; host, API auth, mutation origin checks before body polling; security headers on rejected and successful responses. red-guards-direct.log.
- ui/view/key-changes.keyChanges: DONE; diff arrays; otherwise reason and only truthy key. red-key.log.
- ui/view/status.dashboardStatus: DONE for held-file/remote/approval/conflict/probe order and approval deduplication; PENDING local vaultId guard.
- links/discovery.collectSubmodules: DONE; only collect actual checkouts, never descend non-checkout submodule directory.
- links/discovery.discoverRepos, links/takeover/group.groupOwnLinks, ui/view/repos.groupRepos: PENDING gap; localeCompare ordering differs from Rust byte order.
- links/prune.pruneMissingCheckouts: DONE; TS lstat parent, Rust canonicalizes parent before identity.
- links/checkout/bases.removeCheckoutBases: DONE; remove corrupt marker before checkout/shared bases when no remaining links.
- links/file.linkFile and relinkExisting, local-only.lockedmarkLocalOnly, takeover.adoptLink, checkout.detachFile: DONE; suspected extra prepare callback is the counterpart of the default adapter wrapper in apps/cli/src/adapters.ts, confirmed by reading both implementations. No fix needed.
- commands/server/serve action: PENDING process env retains setup token; std env removal is unsafe in Rust 2024 and user forbids unsafe. No mutation applied.

## CLI/UI follow-up coverage

- DONE commands/sync/history restore parsing: trim JS whitespace; optional v; nonzero first digit; 1..16 digits; round as JS Number; reject before dispatch with INVALID_INPUT fixed text. a2317756; red-history-direct.log, red-parser.log, green-parser.log.
- DONE commands/sync/push conflict-kind: conflict count OR explicit conflict result; JSON still emitted; success text suppressed; throw CONFLICT. 35e809ac; red-push-direct.log, green-push-direct.log.
- DONE program.createProgram parse wrapper: scope empty counts around action and reporting, restore prior context afterwards. 49ff2bc6; red-counts-direct.log, green-counts-direct.log.
- DONE commands/sync/status realHome canonicalization; 4e43f9f2; red-status-home.log and green-status-home-direct.log.
- PENDING ui/start forced dashboard shutdown rather than graceful drain.
- DONE ui/page bundled frontend: fresh Bun.build yields byte-identical HTML, JS and CSS; ui-assets.log. This is shared executable-code evidence, not a separate per-function step inventory.
- DONE output/render/settings configText/settingText/toggleText/listText: local key order, environment overrides, default lists, sanitize listed roots/patterns. Rust settings/render.rs.
- DONE output/render/doctor doctorText/updateLine/tailscaleLine/statusProblem/pass/warn/fail: keys/symlinks/update/network/HTTPS/shell ordering, exact prefixes and fallback text, final console sanitization. Rust diagnostics/render.rs.
- DONE output/render/sync diffText/fileText: differing filter, empty fallback, conflict reason replacement, added/removed/changed key order, formatting-only fallback, blank lines, console sanitization. Rust output/render/diff.rs.
- DONE output/render/devices kit printKit: fixed heading and warning, vault/secret/server order, final console sanitizer; Rust vault/recovery/pdf/report.rs.
- DONE commands/agent/install action: install with user home and injected clock, then fixed success line.
- DONE commands/ui action: interactive stdin, optional parsed port, no-open flag, shutdown signal handling delegated to ui/start.
- DONE ui/routes/page pageRoutes callback: GET-only exact route lookup, 404 fallback, content type and bytes; Rust ui/server/app.rs and assets.rs.
- PENDING remaining output render functions, UI guidance/views/assets functions, command-definition metadata, program helpers and remaining state helpers: no exhaustive completion claim.

## Shared-index races

- 2ea3c6d8 also contains another agent's rust/cli/src/vault/recovery/input.rs test.
- c901783 also captured the exploratory links/fork.rs test and equivalent alias predicate. The test passes before either predicate; no behavioural gap claimed.
- 909c48e captured dashboard read-order extraction and its failing approval-dedup regression alongside the other agent's material change; 3d9ad2f6 fixes deduplication.

## Final validation and boundaries

- Full workspace tests passed in workspace-tests.log and workspace-recheck.log. Newest pass: final-workspace.log.
- Native Clippy passed in clippy-recheck.log. Newest pass: final-clippy.log.
- Windows plain cross-check could not find MinGW gcc. Installed Zig succeeds with the local zig-cc wrapper stripping Cargo's incompatible extra target query; windows-zig-recheck.log. Warnings outside this slice remain in server identity and diagnostics probe; Unix-only checkout test imports were fixed in 4c142660.
- Fresh frontend assets are byte-identical to frozen TS; ui-assets.log.
- Release, parity and e2e outcomes: final-release.log, final-parity.log, final-e2e.log.
- No TypeScript reference sources edited. Other agents continue editing the shared checkout.
- The exploratory aliases self-reference test passes before either predicate and is not a proven gap; captured by the shared-index race in c901783.
- c941813f contains read_store extraction call sites; 88ab94a0 supplies the extracted helper. Review these two commits together.
- The remaining frontend callback inventory is not finished. Matching bundles prove identical code, but do not fulfill the requested per-function written-step inventory.

## Further exact-order limits

- main.runCli wraps parsing in withUpdateStatus in TS; Rust main parses before entering with_update_status for actions. Help/parser failures therefore do not take the TS wrapper path. Not fixed in this pass.
- UI key_changes helper omission of empty keys is fixed; conflict_views has its own typed key construction and still requires an empty-key reachability check.
- ui/routes/api history query ignores an empty query key in Rust, whereas strict TS query parsing may reject it. Needs a failing request-level regression before any change.
- Discovery collectSubmodules now skips non-checkouts and collect reports first; sorting remains byte-order, not localeCompare.

## Complete source-function inventory

Each block records ordered source statements, including arrow callbacks. DONE for frontend functions means the exact same executable JavaScript is embedded in Rust, verified by the byte-identical build in ui-assets.log. Other unverified functions remain PENDING.


### apps/cli/src/commands/agent/install.ts:7 :: callback@7

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
    await installAgent(createAdapters(undefined, Date.now).userHome, Date.now);
    console.log("Agent skill installed");
  }
```


### apps/cli/src/commands/checkouts/local-only.ts:13 :: callback@13

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const adapters = createAdapters(undefined, Date.now);
    const absolute = resolve(file);

    await withStateLock(adapters.home, async () => {
      const state = requireConfigured(await loadState(adapters.home));
      const link = state.links.find((item) => resolve(item.root, item.path) === absolute);
      if (!link) throw new EnvdenError("NOT_FOUND", "File is not managed by envden");
      await markLocalOnly(adapters, state, link.root, relative(link.root, absolute));
    });
  }
```


### apps/cli/src/commands/checkouts/local-only.ts:17 :: callback@17

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
      const state = requireConfigured(await loadState(adapters.home));
      const link = state.links.find((item) => resolve(item.root, item.path) === absolute);
      if (!link) throw new EnvdenError("NOT_FOUND", "File is not managed by envden");
      await markLocalOnly(adapters, state, link.root, relative(link.root, absolute));
    }
```


### apps/cli/src/commands/checkouts/local-only.ts:19 :: callback@19

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
resolve(item.root, item.path) === absolute
```


### apps/cli/src/commands/checkouts/track.ts:15 :: callback@15

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const adapters = createAdapters(undefined, Date.now);

    await withStateLock(adapters.home, async () => {
      const state = requireConfigured(await loadState(adapters.home));

      await setupCheckouts(adapters, state, {
        scanRoot: [path],
        copy: !!options.copy,
        verbose: !!options.verbose,
        command: "track",
        now: Date.now,
      });
    });
  }
```


### apps/cli/src/commands/checkouts/track.ts:18 :: callback@18

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
      const state = requireConfigured(await loadState(adapters.home));

      await setupCheckouts(adapters, state, {
        scanRoot: [path],
        copy: !!options.copy,
        verbose: !!options.verbose,
        command: "track",
        now: Date.now,
      });
    }
```


### apps/cli/src/commands/checkouts/untrack.ts:8 :: callback@8

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const cancelled = await untrack(createAdapters(undefined, Date.now), path);

    for (const file of cancelled) console.log(`Cancelled removal: ${file}`);
  }
```


### apps/cli/src/commands/device/add.ts:7 :: callback@7

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    await runDeviceAdd(createAdapters(undefined, Date.now), Date.now);
  }
```


### apps/cli/src/commands/device/ls.ts:11 :: callback@11

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const devices = await listDevices(createAdapters(undefined, Date.now), Date.now);

    console.log(options.json ? terminalJson(devices) : deviceListText(devices, !!options.verbose));
  }
```


### apps/cli/src/commands/device/rename.ts:9 :: callback@9

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const result = await renameDevice(createAdapters(undefined, Date.now), name, Date.now);

    console.log(
      result.kind === "unchanged"
        ? "This device already has that name"
        : `This device is now ${sanitizeTerminal(name)}`,
    );
  }
```


### apps/cli/src/commands/device/rm.ts:16 :: callback@16

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const adapters = createAdapters(undefined, Date.now);
    const output = replacementKitOutput(adapters, options.kitOut);

    const result = await removeDevice(
      adapters,
      device,
      () => secret("Master password"),
      Date.now,
      fetch,
      options.newKit,
      () => consent("This device held recovery keys. Replace the recovery kit in this removal?"),
      async (exposure) => {
        console.log(exposureText(exposure));

        return consent("Remove this device?");
      },
      output.show,
    ).catch(output.fail);

    console.log(
      result.kind === "finished"
        ? "Finished an interrupted removal; the recovery kit it showed is now active"
        : "Device removed",
    );
  }
```


### apps/cli/src/commands/device/rm.ts:23 :: callback@23

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
secret("Master password")
```


### apps/cli/src/commands/device/rm.ts:27 :: callback@27

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
consent("This device held recovery keys. Replace the recovery kit in this removal?")
```


### apps/cli/src/commands/device/rm.ts:28 :: callback@28

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
        console.log(exposureText(exposure));

        return consent("Remove this device?");
      }
```


### apps/cli/src/commands/maintenance/config.ts:19 :: callback@19

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    console.log(
      await applySetting(settingRequest(key, values), createAdapters(undefined, Date.now)),
    );
  }
```


### apps/cli/src/commands/maintenance/config.ts:25 :: applySetting

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  switch (request.kind) {
    case "list":
      return configText(await readConfig(adapters.home));
    case "read":
      return request.key === "unlock-period"
        ? unlockPeriodText((await getUnlockPeriod(adapters, Date.now)).period)
        : settingText(request.key, await readConfig(adapters.home));
    case "placement":
      return settingText(
        "placement",
        await setCheckoutPlacement(adapters, request.checkout, request.mode),
      );
    case "unlock-period":
      requireConfigured(await loadState(adapters.home));
      await setUnlockPeriod(adapters, request.value, await secret("Master password"), Date.now);

      return `unlock-period: ${request.value}`;
    case "set":
      return settingText(
        request.key,
        await setConfig(request.key, request.value, adapters.home, Date.now),
      );
  }
}
```


### apps/cli/src/commands/maintenance/doctor.ts:11 :: callback@11

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const adapters = createAdapters(undefined, Date.now);
    const report = await doctor(adapters, paths(adapters.home));

    console.log(options.json ? terminalJson(report) : doctorText(report));
  }
```


### apps/cli/src/commands/maintenance/update.ts:12 :: callback@12

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
    const commandTime = Date.now();

    const adapters = createAdapters(undefined, Date.now);

    if (options.postInstall) {
      await refreshInstallation(adapters);

      return;
    }

    const result = options.check
      ? await runUpdateCheck(adapters, commandTime)
      : await selfUpdate(adapters, {
          fetcher: fetch,
          binary: process.execPath,
        });

    console.log(terminalJson(result));
  }
```


### apps/cli/src/commands/maintenance/version.ts:6 :: callback@6

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
console.log(VERSION)
```


### apps/cli/src/commands/onboarding/join.ts:21 :: callback@21

PENDING

Ordered statements:

```ts
{
    const adapters = createAdapters(undefined, Date.now);
    const address = requireServerAddress(server);

    if ((await loadState(adapters.home))?.checkpoint) {
      await runRejoin(adapters, address, options, Date.now);

      return;
    }

    const state = await runJoin(adapters, address, options, Date.now);

    for (const line of joinSummary(state, await realHome(adapters.userHome))) console.log(line);
  }
```


### apps/cli/src/commands/onboarding/missing-setup-flags.ts:12 :: missingSetupFlags

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (interactive || choices.yes) return [];

  return [
    ...(!choices.server && !choices.hostServer ? ["--server <url> or --host-server"] : []),
    ...(!choices.telemetry ? ["--telemetry on|off"] : []),
    ...(!choices.updateCheck ? ["--update-check on|off"] : []),
    ...(!choices.shell ? ["--shell zsh|bash|fish|powershell|none"] : []),
    ...(!choices.agent ? ["--agent on|off"] : []),
    ...(!choices.scanRoot?.length ? ["--scan-root <path...>"] : []),
  ];
}
```


### apps/cli/src/commands/onboarding/options.ts:4 :: withPreferences

PENDING

Ordered statements:

```ts
{
  return command
    .addOption(new Option("--telemetry <choice>", "Anonymous telemetry").choices(TOGGLES))
    .addOption(new Option("--update-check <choice>", "Daily update check").choices(TOGGLES))
    .addOption(new Option("--shell <shell>", "Shell notice").choices([...SHELLS, "none"] as const))
    .addOption(new Option("--agent <choice>", "Install the agent skill").choices(TOGGLES));
}
```


### apps/cli/src/commands/onboarding/setup.ts:26 :: callback@26

PENDING

Ordered statements:

```ts
{
    const missing = missingSetupFlags(!!process.stdin.isTTY, options);

    if (missing.length) {
      console.error(`Missing choices: ${missing.join(", ")}. Or run setup in your own terminal.`);

      throw new EnvdenError("INVALID_INPUT", "Setup choices require your own terminal");
    }

    const adapters = createAdapters(undefined, Date.now);
    const state = await runSetup(adapters, options, Date.now);

    for (const line of setupSummary(state, await realHome(adapters.userHome))) console.log(line);
  }
```


### apps/cli/src/commands/onboarding/unlock.ts:8 :: callback@8

PENDING

Ordered statements:

```ts
{
    await unlockDevice(
      createAdapters(undefined, Date.now),
      (retry) => secret(retry ? "Wrong master password. Try again" : "Master password"),
      Date.now,
      fetch,
    );

    console.log("Unlocked");
  }
```


### apps/cli/src/commands/onboarding/unlock.ts:11 :: callback@11

PENDING

Ordered statements:

```ts
secret(retry ? "Wrong master password. Try again" : "Master password")
```


### apps/cli/src/commands/server/move.ts:18 :: callback@18

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const continuing = options.resume || options.abort;

    if (!server && !continuing)
      throw new EnvdenError(
        "INVALID_INPUT",
        "Give the destination server address, or --resume or --abort for an unfinished move",
      );

    await moveServer(createAdapters(undefined, Date.now), {
      address: server && requireServerAddress(server),
      token: continuing ? options.setupToken : await readToken("setup", options.setupToken),
      resume: options.resume,
      abort: options.abort,
      password: await secret("Master password"),
      now: Date.now,
      fetcher: fetch,
    });

    console.log("Move complete");
  }
```


### apps/cli/src/commands/server/port.ts:4 :: parsePort

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const port = /^\d{1,5}$/.test(value) ? Number(value) : -1;

  if (port < 0 || port > 65535)
    throw new InvalidArgumentError("Expected a port from 0 (any free port) to 65535.");

  return port;
}
```


### apps/cli/src/commands/server/repair.ts:21 :: callback@21

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const token = await readToken("repair", options.repairToken);

    if (options.finish) {
      const result = await finishRepair(createAdapters(undefined, Date.now), {
        token,
        password: await secret("Master password"),
        without: options.without,
        acceptLost: options.acceptLost,
        now: Date.now,
        fetcher: fetch,
      });

      console.log(repairText(result));

      await offerReplacementKit(result);
    } else {
      await uploadRepair(createAdapters(undefined, Date.now), token, Date.now);

      console.log(
        "Uploaded this device's data. Once every device has done this, run envden server repair --finish",
      );
    }
  }
```


### apps/cli/src/commands/server/repair.ts:46 :: offerReplacementKit

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (
    result.kind === "finished" &&
    result.replaceKit &&
    (await consent("Replace the recovery kit now?"))
  )
    await runVaultAdmin(createAdapters(undefined, Date.now), "replace", Date.now);
}
```


### apps/cli/src/commands/server/serve.ts:5 :: setupTokenFrom

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const setupToken = env.ENVDEN_SETUP_TOKEN;
  delete env.ENVDEN_SETUP_TOKEN;

  return setupToken ? { setupToken } : {};
}
```


### apps/cli/src/commands/server/serve.ts:18 :: callback@18

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    await serve({ ...options, ...setupTokenFrom(process.env) });
  }
```


### apps/cli/src/commands/server/switch.ts:8 :: callback@8

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    await switchServer(createAdapters(undefined, Date.now), server, Date.now);

    console.log("Server switched");
  }
```


### apps/cli/src/commands/shell/shell.ts:19 :: callback@19

PENDING

Ordered statements:

```ts
{
        await manageShell(
          createAdapters(undefined, Date.now),
          action,
          shell ?? (await shellChoice()),
        );
      }
```


### apps/cli/src/commands/sync/alias.ts:9 :: callback@9

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    await aliasUnlinkedRepo(createAdapters(undefined, Date.now), repo, target);

    console.log("Alias saved");
  }
```


### apps/cli/src/commands/sync/diff.ts:12 :: callback@12

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const files = await diff(createAdapters(undefined, Date.now), syncOptions(options, Date.now));

    console.log(options.json ? terminalJson(files) : diffText(files));
  }
```


### apps/cli/src/commands/sync/history.ts:23 :: callback@23

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
    const adapters = createAdapters(undefined, Date.now);
    const common = { cwd: process.cwd(), now: Date.now, fetcher: fetch };

    if (options.restore === undefined) {
      const result = await fileHistory(adapters, {
        ...common,
        ...(file ? { file } : {}),
        all: !!options.all,
      });

      console.log(options.json ? terminalJson(result) : historyText(result, Date.now()));

      return;
    }

    if (!file) throw new EnvdenError("INVALID_INPUT", "Name the env file to restore");

    const result = await restoreVersion(adapters, {
      ...common,
      file,
      version: options.restore,
      yes: !!options.yes,
      interactive: !!process.stdin.isTTY,
      confirm: consent,
    });

    console.log(options.json ? terminalJson(result) : restoreText(result));
  }
```


### apps/cli/src/commands/sync/pull.ts:14 :: callback@14

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const result = await pull(createAdapters(undefined, Date.now), syncOptions(options, Date.now));

    if (options.json) console.log(terminalJson(result));
    else if (!result.conflicts) console.log(syncText("pull", result));

    // the conflict lines above already name each file; this summary sets exit code 3
    if (result.conflicts) throw new EnvdenError("CONFLICT", syncText("pull", result));
  }
```


### apps/cli/src/commands/sync/push.ts:14 :: callback@14

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
    const result = await push(createAdapters(undefined, Date.now), syncOptions(options, Date.now));

    const conflicted = result.conflicts || result.kind === "conflict";

    if (options.json) console.log(terminalJson(result));
    else if (!conflicted) console.log(syncText("push", result));

    // the conflict lines above already name each file; this summary sets exit code 3
    if (conflicted) throw new EnvdenError("CONFLICT", syncText("push", result));
  }
```


### apps/cli/src/commands/sync/resolve.ts:18 :: callback@18

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    if (options.list) {
      const records = await conflictRecords(createAdapters(undefined, Date.now).home);

      console.log(options.json ? terminalJson(records) : conflictsText(records));

      return;
    }

    if (
      (options.keepMine || options.takeServer) &&
      !process.stdin.isTTY &&
      !(await readConfig(createAdapters(undefined, Date.now).home))["agent-merge"]
    )
      throw new EnvdenError(
        "INVALID_INPUT",
        "Resolution requires a terminal; use --list, or config agent-merge on before --keep-mine/--take-server",
      );

    const result = await resolveConflict(createAdapters(undefined, Date.now), {
      ...(file ? { file } : {}),
      ...(options.repo ? { repo: options.repo } : {}),
      now: Date.now,
      choice: resolutionChoice(options.keepMine, options.takeServer),
    });

    console.log(options.json ? terminalJson(result) : resolvedText(result));
  }
```


### apps/cli/src/commands/sync/resolve.ts:47 :: resolutionChoice

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (keep) return "keep-mine";

  return take ? "take-server" : "edit";
}
```


### apps/cli/src/commands/sync/rm.ts:12 :: callback@12

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const result = await removeFile(createAdapters(undefined, Date.now), path, {
      yes: !!options.yes,
      interactive: !!process.stdin.isTTY,
      confirm: consent,
      now: Date.now,
      report: (message) => (options.json ? console.error : console.log)(sanitizeTerminal(message)),
    });

    if (options.json) console.log(terminalJson(result));
    else {
      for (const path of result.skipped)
        console.log(sanitizeTerminal(`Skipped ${path}: run envden track to approve this checkout`));

      console.log(
        result.kind === "blocked"
          ? "Removal held back; approve the skipped checkout first"
          : result.publish === "next-push"
            ? "Removed locally; run envden push to delete everywhere"
            : "Removed unpublished file locally",
      );
    }
  }
```


### apps/cli/src/commands/sync/rm.ts:18 :: callback@18

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
(options.json ? console.error : console.log)(sanitizeTerminal(message))
```


### apps/cli/src/commands/sync/status.ts:13 :: callback@13

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
    const adapters = createAdapters(undefined, Date.now);

    if (options.refreshCache) {
      await commandNotice(adapters, Date.now(), fetch, true, process.cwd());

      return;
    }

    const report = await statusReport(adapters);

    await commandNotice(adapters, Date.now(), fetch, false, process.cwd(), true);

    console.log(
      options.json
        ? terminalJson(report)
        : statusText(report, { cwd: process.cwd(), userHome: await realHome(adapters.userHome) }),
    );
  }
```


### apps/cli/src/commands/ui/ui.ts:10 :: callback@10

PENDING

Ordered statements:

```ts
{
    await runDashboard(createAdapters(undefined, Date.now), {
      interactive: !!process.stdin.isTTY,
      ...(options.port === undefined ? {} : { port: options.port }),
      now: Date.now,
      report: (line) => console.log(line),
      ...(options.open ? { open: openBrowser } : {}),
      stopped: interrupted(),
    });
  }
```


### apps/cli/src/commands/ui/ui.ts:15 :: callback@15

PENDING

Ordered statements:

```ts
console.log(line)
```


### apps/cli/src/commands/ui/ui.ts:21 :: interrupted

PENDING

Ordered statements:

```ts
{
  return new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}
```


### apps/cli/src/commands/ui/ui.ts:22 :: callback@22

PENDING

Ordered statements:

```ts
{
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  }
```


### apps/cli/src/commands/vault/output.ts:10 :: reportReplacementKit

PENDING

Ordered statements:

```ts
{
  if (!path) {
    const deviceName = (await loadState(adapters.home))?.deviceName ?? adapters.hostname;

    return reportKit(kit, { userHome: adapters.userHome, deviceName, now: adapters.now() });
  }

  try {
    await writeKit(path, kit);
    printKitSaved(path, "json");
  } catch {
    console.error("envden: Could not save the recovery kit; save the kit printed below");
    printKit(kit);
  }
}
```


### apps/cli/src/commands/vault/output.ts:30 :: replacementKitOutput

PENDING

Ordered statements:

```ts
{
  let shown = false;

  return {
    show: async (kit: IReplacementKit) => {
      await reportReplacementKit(adapters, kit, path);
      shown = true;
    },
    fail: (error: unknown): never => {
      if (shown)
        console.error(
          "envden: The new recovery kit is not confirmed yet. Keep the old kit too, and rerun this command to finish.",
        );

      throw error;
    },
  };
}
```


### apps/cli/src/commands/vault/output.ts:34 :: callback@34

PENDING

Ordered statements:

```ts
{
      await reportReplacementKit(adapters, kit, path);
      shown = true;
    }
```


### apps/cli/src/commands/vault/output.ts:38 :: callback@38

PENDING

Ordered statements:

```ts
{
      if (shown)
        console.error(
          "envden: The new recovery kit is not confirmed yet. Keep the old kit too, and rerun this command to finish.",
        );

      throw error;
    }
```


### apps/cli/src/commands/vault/run.ts:9 :: runVaultAdmin

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (action === "replace") {
    const output = replacementKitOutput(adapters, kitOut);

    const result = await replaceKit(
      adapters,
      await prompt("Master password"),
      now,
      output.show,
    ).catch(output.fail);

    console.log(
      result.kind === "finished"
        ? "Finished an interrupted kit replacement; the kit it showed is now active. Run again for another kit."
        : "Recovery kit replaced; the old kit no longer works",
    );

    return;
  }

  await actions[action](adapters, now, prompt);
}
```


### apps/cli/src/commands/vault/run.ts:39 :: callback@39

PENDING

Ordered statements:

```ts
{
    await rotateVault(adapters, await prompt("Master password"), now);
    console.log("Vault re-keyed; removed devices can't read new changes");
  }
```


### apps/cli/src/commands/vault/run.ts:43 :: callback@43

PENDING

Ordered statements:

```ts
{
    await changePassword(
      adapters,
      await prompt("Old master password"),
      await confirmedPassword(prompt),
      await prompt("Recovery secret key"),
      now,
    );

    console.log("Password changed; the kit stays valid");
  }
```


### apps/cli/src/commands/vault/run.ts:54 :: callback@54

PENDING

Ordered statements:

```ts
{
    await resetPassword(
      adapters,
      await confirmedPassword(prompt),
      await prompt("Recovery secret key"),
      now,
    );

    console.log("Password reset; the kit stays valid");
  }
```


### apps/cli/src/commands/vault/vault.ts:10 :: callback@10

PENDING

Ordered statements:

```ts
{
        await runVaultAdmin(createAdapters(undefined, Date.now), "rotate", Date.now);
      }
```


### apps/cli/src/commands/vault/vault.ts:22 :: callback@22

PENDING

Ordered statements:

```ts
{
          await runVaultAdmin(
            createAdapters(undefined, Date.now),
            "replace",
            Date.now,
            undefined,
            options.kitOut,
          );
        }
```


### apps/cli/src/commands/vault/vault.ts:39 :: callback@39

PENDING

Ordered statements:

```ts
{
            await runVaultAdmin(createAdapters(undefined, Date.now), "change", Date.now);
          }
```


### apps/cli/src/commands/vault/vault.ts:46 :: callback@46

PENDING

Ordered statements:

```ts
{
            await runVaultAdmin(createAdapters(undefined, Date.now), "reset", Date.now);
          }
```


### apps/cli/src/links/alias.ts:7 :: lockedAliasRepo

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/alias.ts:22 :: deriveAlias

DONE

Ordered statements:

```ts
{
  if (!source || !target || source === target) return { kind: "invalid" } as const;
  if (aliases[target] || Object.values(aliases).includes(source)) return { kind: "chain" } as const;

  return { kind: "assign" } as const;
}
```


### apps/cli/src/links/alias.ts:29 :: aliasRepo

DONE

Ordered statements:

```ts
{
  return withStateLock(args[0].home, () => lockedAliasRepo(...args));
}
```


### apps/cli/src/links/alias.ts:30 :: callback@30

DONE

Ordered statements:

```ts
lockedAliasRepo(...args)
```


### apps/cli/src/links/approval.ts:5 :: checkoutApproval

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/approval.ts:9 :: callback@9

DONE

Ordered statements:

```ts
item.root === checkout.root
```


### apps/cli/src/links/approval.ts:19 :: callback@19

DONE

Ordered statements:

```ts
item.root === checkout.root &&
      item.gitDir === checkout.gitDir &&
      item.identity === checkout.identity &&
      (state.aliases[item.repoId] ?? item.repoId) ===
        (state.aliases[checkout.repoId] ?? checkout.repoId)
```


### apps/cli/src/links/approval.ts:30 :: approvedCheckout

DONE

Ordered statements:

```ts
{
  const checkout = await repo.checkoutAt(root);

  return checkout && checkoutApproval(state, checkout) === "approved" ? checkout : undefined;
}
```


### apps/cli/src/links/approval.ts:40 :: checkoutLabel

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/approval.ts:49 :: callback@49

DONE

Ordered statements:

```ts
item.gitDir === checkout.gitDir && item.repoId === checkout.repoId
```


### apps/cli/src/links/checkout/bases.ts:6 :: removeCheckoutBases

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/checkout/bases.ts:17 :: callback@17

DONE

Ordered statements:

```ts
item.store === link.store
```


### apps/cli/src/links/checkout/mode.ts:7 :: checkoutPlacement

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/checkout/mode.ts:48 :: hasContainerFiles

DONE

Ordered statements:

```ts
{
  return entries.some((entry) =>
    entry.name === ".devcontainer"
      ? entry.isDirectory()
      : entry.isFile() &&
        (entry.name === "Dockerfile" || /^docker-compose.*\.yml$/.test(entry.name)),
  );
}
```


### apps/cli/src/links/checkout/mode.ts:49 :: callback@49

DONE

Ordered statements:

```ts
entry.name === ".devcontainer"
      ? entry.isDirectory()
      : entry.isFile() &&
        (entry.name === "Dockerfile" || /^docker-compose.*\.yml$/.test(entry.name))
```


### apps/cli/src/links/checkout/repo.ts:3 :: checkoutRepo

DONE

Ordered statements:

```ts
{
  const approved = state.approved.find((item) => item.root === root);

  return approved && (state.aliases[approved.repoId] ?? approved.repoId);
}
```


### apps/cli/src/links/checkout/repo.ts:4 :: callback@4

DONE

Ordered statements:

```ts
item.root === root
```


### apps/cli/src/links/checkout/supported.ts:6 :: supportedPlacement

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/checkout/untrack.ts:17 :: untrack

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/checkout/untrack.ts:18 :: callback@18

DONE

Ordered statements:

```ts
{
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
  }
```


### apps/cli/src/links/checkout/untrack.ts:22 :: callback@22

DONE

Ordered statements:

```ts
item.root === root
```


### apps/cli/src/links/checkout/untrack.ts:27 :: callback@27

DONE

Ordered statements:

```ts
item.root === root
```


### apps/cli/src/links/checkout/untrack.ts:32 :: callback@32

DONE

Ordered statements:

```ts
item.store === link.store && item.root !== root
```


### apps/cli/src/links/checkout/untrack.ts:40 :: callback@40

DONE

Ordered statements:

```ts
path !== join(root, link.path)
```


### apps/cli/src/links/checkout/untrack.ts:52 :: callback@52

DONE

Ordered statements:

```ts
item.root === root
```


### apps/cli/src/links/checkout/untrack.ts:53 :: callback@53

DONE

Ordered statements:

```ts
item.root !== root
```


### apps/cli/src/links/checkout/untrack.ts:59 :: callback@59

DONE

Ordered statements:

```ts
item.root !== root
```


### apps/cli/src/links/checkout/untrack.ts:60 :: callback@60

DONE

Ordered statements:

```ts
item.root !== root
```


### apps/cli/src/links/checkout/untrack.ts:66 :: callback@66

DONE

Ordered statements:

```ts
adapters.repo.caseInsensitive(root, true)
```


### apps/cli/src/links/checkout/untrack.ts:74 :: detachFile

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/checkout/worktree.ts:9 :: worktreeApproval

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/checkout/worktree.ts:23 :: callback@23

DONE

Ordered statements:

```ts
item.root === checkout.root
```


### apps/cli/src/links/checkout/worktree.ts:30 :: autoApprovedWorktree

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/checkout/worktree.ts:48 :: adoptWorktreeAt

DONE

Ordered statements:

```ts
{
  const checkout = await adapters.repo.checkoutAt(path).catch(() => undefined);
  if (!checkout || !(await autoApprovedWorktree(adapters, state, checkout))) return;

  state.approved.push(checkout);
  report(worktreeApprovedNotice(checkout));
}
```


### apps/cli/src/links/checkout/worktree.ts:54 :: callback@54

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/links/checkout/worktree.ts:61 :: worktreeApprovedNotice

DONE

Ordered statements:

```ts
{
  return sanitizeTerminal(`Approved worktree ${checkout.root} (auto-approve-worktrees)`);
}
```


### apps/cli/src/links/checkout/worktree.ts:65 :: approvedClone

DONE

Ordered statements:

```ts
{
  for (const item of state.approved) {
    if (item.gitDir !== checkout.gitDir || item.root === checkout.root) continue;
    const clone = await repo.checkoutAt(item.root).catch(() => undefined);
    if (clone && !clone.registeredWorktree) return clone;
  }

  return undefined;
}
```


### apps/cli/src/links/checkout/worktree.ts:72 :: callback@72

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/links/checkout/worktree.ts:79 :: repoOf

DONE

Ordered statements:

```ts
{
  return state.aliases[checkout.repoId] ?? checkout.repoId;
}
```


### apps/cli/src/links/discovery/folders.ts:51 :: skippedFolder

DONE

Ordered statements:

```ts
{
  return (
    name.startsWith(".") ||
    everywhere.has(name) ||
    (place.home && homeLevel.has(name)) ||
    (place.project && projectOutput.has(name))
  );
}
```


### apps/cli/src/links/discovery/folders.ts:60 :: projectFolder

DONE

Ordered statements:

```ts
{
  return names.some((name) => manifests.has(name));
}
```


### apps/cli/src/links/discovery/folders.ts:61 :: callback@61

DONE

Ordered statements:

```ts
manifests.has(name)
```


### apps/cli/src/links/discovery/identify.ts:12 :: identify

DONE

Ordered statements:

```ts
{
  try {
    const checkout = await repo.checkoutAt(path);
    if (!checkout) report({ path, reason: "Repository identity unavailable", kind: "identity" });

    return checkout;
  } catch (error) {
    report(repoSkip(path, error));

    return undefined;
  }
}
```


### apps/cli/src/links/discovery/identify.ts:30 :: repoSkip

DONE

Ordered statements:

```ts
{
  if (error instanceof EnvdenError && error.code === "INVALID_INPUT")
    return { path, reason: error.message, kind: "remote" };

  return {
    path,
    reason: error instanceof EnvdenError ? error.message : "Repository identity unavailable",
    kind: "identity",
  };
}
```


### apps/cli/src/links/discovery/repos.ts:36 :: discoverRepos

PENDING

Ordered statements:

```ts
{
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
```


### apps/cli/src/links/discovery/repos.ts:55 :: callback@55

PENDING

Ordered statements:

```ts
walkFolder(walk, resolve(root), true)
```


### apps/cli/src/links/discovery/repos.ts:58 :: callback@58

PENDING

Ordered statements:

```ts
a.root.localeCompare(b.root)
```


### apps/cli/src/links/discovery/repos.ts:62 :: walkFolder

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/discovery/repos.ts:63 :: callback@63

DONE

Ordered statements:

```ts
realpath(path).catch(() => undefined)
```


### apps/cli/src/links/discovery/repos.ts:63 :: callback@63

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/links/discovery/repos.ts:67 :: callback@67

DONE

Ordered statements:

```ts
readdir(real, { withFileTypes: true }).catch(() => undefined)
```


### apps/cli/src/links/discovery/repos.ts:68 :: callback@68

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/links/discovery/repos.ts:74 :: callback@74

DONE

Ordered statements:

```ts
entry.name === ".git"
```


### apps/cli/src/links/discovery/repos.ts:79 :: callback@79

DONE

Ordered statements:

```ts
entry.name
```


### apps/cli/src/links/discovery/repos.ts:84 :: callback@84

DONE

Ordered statements:

```ts
canDescend(entry, place)
```


### apps/cli/src/links/discovery/repos.ts:85 :: callback@85

DONE

Ordered statements:

```ts
walkFolder(walk, join(real, entry.name))
```


### apps/cli/src/links/discovery/repos.ts:89 :: collect

DONE

Ordered statements:

```ts
{
  const checkout = await walk.git(() => identify(walk.repo, path, report(walk)));
  if (!checkout) return false;
  add(walk, checkout);
  await Promise.all([collectWorktrees(walk, checkout), collectSubmodules(walk, checkout)]);

  return true;
}
```


### apps/cli/src/links/discovery/repos.ts:90 :: callback@90

DONE

Ordered statements:

```ts
identify(walk.repo, path, report(walk))
```


### apps/cli/src/links/discovery/repos.ts:99 :: collectWorktrees

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/discovery/repos.ts:100 :: callback@100

DONE

Ordered statements:

```ts
listed(() => walk.repo.worktrees(checkout))
```


### apps/cli/src/links/discovery/repos.ts:100 :: callback@100

DONE

Ordered statements:

```ts
walk.repo.worktrees(checkout)
```


### apps/cli/src/links/discovery/repos.ts:104 :: callback@104

DONE

Ordered statements:

```ts
!walk.found.has(worktree) && !excludedPath(worktree, walk.excludes)
```


### apps/cli/src/links/discovery/repos.ts:105 :: callback@105

DONE

Ordered statements:

```ts
{
        const next = await walk.git(() => identify(walk.repo, worktree, report(walk)));
        if (next) add(walk, next);
      }
```


### apps/cli/src/links/discovery/repos.ts:106 :: callback@106

DONE

Ordered statements:

```ts
identify(walk.repo, worktree, report(walk))
```


### apps/cli/src/links/discovery/repos.ts:112 :: collectSubmodules

DONE

Ordered statements:

```ts
{
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
```


### apps/cli/src/links/discovery/repos.ts:113 :: callback@113

DONE

Ordered statements:

```ts
listed(() => walk.repo.submodules(checkout))
```


### apps/cli/src/links/discovery/repos.ts:113 :: callback@113

DONE

Ordered statements:

```ts
walk.repo.submodules(checkout)
```


### apps/cli/src/links/discovery/repos.ts:114 :: callback@114

DONE

Ordered statements:

```ts
resolve(checkout.root, path)
```


### apps/cli/src/links/discovery/repos.ts:115 :: callback@115

DONE

Ordered statements:

```ts
placeInRoot(checkout.root, path) === "inside"
```


### apps/cli/src/links/discovery/repos.ts:118 :: callback@118

DONE

Ordered statements:

```ts
{
      const real = await walk.fs(() => realpath(submodule).catch(() => undefined));
      if (!real || !unseen(walk, real)) return;
      walk.visited.add(real);
      if (await walk.fs(() => isCheckout(real))) await collect(walk, real);
    }
```


### apps/cli/src/links/discovery/repos.ts:119 :: callback@119

DONE

Ordered statements:

```ts
realpath(submodule).catch(() => undefined)
```


### apps/cli/src/links/discovery/repos.ts:119 :: callback@119

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/links/discovery/repos.ts:122 :: callback@122

DONE

Ordered statements:

```ts
isCheckout(real)
```


### apps/cli/src/links/discovery/repos.ts:128 :: listed

DONE

Ordered statements:

```ts
{
  return list().catch((): string[] => []);
}
```


### apps/cli/src/links/discovery/repos.ts:129 :: callback@129

DONE

Ordered statements:

```ts
[]
```


### apps/cli/src/links/discovery/repos.ts:132 :: add

DONE

Ordered statements:

```ts
{
  walk.found.set(checkout.root, checkout);
  walk.events.progress?.(walk.found.size);
}
```


### apps/cli/src/links/discovery/repos.ts:137 :: report

DONE

Ordered statements:

```ts
{
  return walk.events.report ?? (() => {});
}
```


### apps/cli/src/links/discovery/repos.ts:138 :: callback@138

DONE

Ordered statements:

```ts
{}
```


### apps/cli/src/links/discovery/repos.ts:141 :: unseen

DONE

Ordered statements:

```ts
{
  return !walk.visited.has(real) && !excludedPath(real, walk.excludes);
}
```


### apps/cli/src/links/discovery/repos.ts:145 :: excludedPath

DONE

Ordered statements:

```ts
{
  return excludes.some((excluded) => placeInRoot(excluded, path) !== "outside");
}
```


### apps/cli/src/links/discovery/repos.ts:146 :: callback@146

DONE

Ordered statements:

```ts
placeInRoot(excluded, path) !== "outside"
```


### apps/cli/src/links/discovery/repos.ts:149 :: realOrResolved

DONE

Ordered statements:

```ts
{
  return realpath(path).catch(() => resolve(path));
}
```


### apps/cli/src/links/discovery/repos.ts:150 :: callback@150

DONE

Ordered statements:

```ts
resolve(path)
```


### apps/cli/src/links/discovery/repos.ts:154 :: canDescend

DONE

Ordered statements:

```ts
{
  return (entry.isDirectory() || entry.isSymbolicLink()) && !skippedFolder(entry.name, place);
}
```


### apps/cli/src/links/discovery/repos.ts:158 :: isCheckout

DONE

Ordered statements:

```ts
{
  const entries = await readdir(path).catch((): string[] => []);

  return entries.includes(".git");
}
```


### apps/cli/src/links/discovery/repos.ts:159 :: callback@159

DONE

Ordered statements:

```ts
[]
```


### apps/cli/src/links/file.ts:25 :: linkFile

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/file.ts:35 :: callback@35

DONE

Ordered statements:

```ts
item.root === checkout.root && item.path === path
```


### apps/cli/src/links/file.ts:51 :: callback@51

DONE

Ordered statements:

```ts
target
```


### apps/cli/src/links/file.ts:100 :: chooseVersion

DONE

Ordered statements:

```ts
{
  if (!process.stdin.isTTY) return "skip";

  const choice = await choose(`${path} differs from the synced copy`, [
    { value: "separate" as const, label: "Keep separate (local only)" },
    { value: "store" as const, label: "Use the synced version" },
  ]);

  return choice;
}
```


### apps/cli/src/links/file.ts:111 :: storeChoice

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/file.ts:142 :: copyBase

DONE

Ordered statements:

```ts
{
  if (mode !== "copy") return;
  await writeBytes(basePath(home, store, root), await readBytes(store), now);
}
```


### apps/cli/src/links/file.ts:153 :: relinkExisting

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/file.ts:172 :: exists

DONE

Ordered statements:

```ts
{
  try {
    await lstat(path);

    return true;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
    throw cause;
  }
}
```


### apps/cli/src/links/fork.ts:8 :: shouldAskAlias

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/fork.ts:16 :: callback@16

DONE

Ordered statements:

```ts
item.repoId === checkout.repoId
```


### apps/cli/src/links/fork.ts:16 :: callback@16

DONE

Ordered statements:

```ts
item.root
```


### apps/cli/src/links/fork.ts:21 :: callback@21

DONE

Ordered statements:

```ts
roots.has(item.root)
```


### apps/cli/src/links/fork.ts:29 :: vaultRepos

PENDING

Ordered statements:

```ts
{
  if (!state.checkpoint) return new Set<string>();
  const context = await syncContext(adapters, { now, fetcher: adapters.fetcher, all: true });

  return new Set(
    readableEntries(context)
      .filter((entry) => entry.state === 1 || entry.state === 3)
      .map((entry) => entryName(context, entry).repoId),
  );
}
```


### apps/cli/src/links/fork.ts:35 :: callback@35

PENDING

Ordered statements:

```ts
entry.state === 1 || entry.state === 3
```


### apps/cli/src/links/fork.ts:36 :: callback@36

PENDING

Ordered statements:

```ts
entryName(context, entry).repoId
```


### apps/cli/src/links/fork.ts:40 :: offerForkAlias

DONE

Ordered statements:

```ts
{
  if (!shouldAskAlias(state, checkout, repos)) return;
  const target = checkout.upstreamRepoId!;
  state.aliasAsked = [...(state.aliasAsked ?? []), checkout.repoId];
  if (await confirm(checkout.repoId, target)) state.aliases[checkout.repoId] = target;
}
```


### apps/cli/src/links/local-only.ts:8 :: lockedmarkLocalOnly

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/local-only.ts:14 :: callback@14

DONE

Ordered statements:

```ts
item.root === root && item.path === path
```


### apps/cli/src/links/local-only.ts:28 :: markLocalOnly

DONE

Ordered statements:

```ts
{
  return withStateLock(args[0].home, () => lockedmarkLocalOnly(...args));
}
```


### apps/cli/src/links/local-only.ts:29 :: callback@29

DONE

Ordered statements:

```ts
lockedmarkLocalOnly(...args)
```


### apps/cli/src/links/place.ts:13 :: lockedlinkCheckout

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/place.ts:32 :: callback@32

DONE

Ordered statements:

```ts
item.root !== checkout.root
```


### apps/cli/src/links/place.ts:49 :: callback@49

DONE

Ordered statements:

```ts
!siblingLink(link, paths)
```


### apps/cli/src/links/place.ts:52 :: linkCheckout

DONE

Ordered statements:

```ts
{
  return withStateLock(args[0].home, () => lockedlinkCheckout(...args));
}
```


### apps/cli/src/links/place.ts:53 :: callback@53

DONE

Ordered statements:

```ts
lockedlinkCheckout(...args)
```


### apps/cli/src/links/prune.ts:9 :: pruneMissingCheckouts

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/prune.ts:15 :: callback@15

DONE

Ordered statements:

```ts
{
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
  }
```


### apps/cli/src/links/prune.ts:21 :: callback@21

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/links/prune.ts:26 :: callback@26

DONE

Ordered statements:

```ts
item.root !== approval.root
```


### apps/cli/src/links/prune.ts:30 :: callback@30

DONE

Ordered statements:

```ts
item.root === approval.root
```


### apps/cli/src/links/prune.ts:31 :: callback@31

DONE

Ordered statements:

```ts
item.root !== approval.root
```


### apps/cli/src/links/prune.ts:37 :: callback@37

DONE

Ordered statements:

```ts
item.root !== approval.root
```


### apps/cli/src/links/takeover/adopt.ts:16 :: adoptGroup

DONE

Ordered statements:

```ts
{
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
```


### apps/cli/src/links/takeover/adopt.ts:44 :: callback@44

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/links/takeover/adopt.ts:59 :: adoptLink

DONE

Ordered statements:

```ts
{
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


### apps/cli/src/links/takeover/group.ts:10 :: groupOwnLinks

PENDING

Ordered statements:

```ts
{
  const groups = new Map<string, IOwnLink[]>();

  for (const link of links) groups.set(link.target, [...(groups.get(link.target) ?? []), link]);

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([target, items]) => ({ target, links: items.toSorted(byDestination) }));
}
```


### apps/cli/src/links/takeover/group.ts:16 :: callback@16

PENDING

Ordered statements:

```ts
a.localeCompare(b)
```


### apps/cli/src/links/takeover/group.ts:17 :: callback@17

PENDING

Ordered statements:

```ts
({ target, links: items.toSorted(byDestination) })
```


### apps/cli/src/links/takeover/group.ts:20 :: takeoverQuestion

DONE

Ordered statements:

```ts
{
  const [first, ...others] = group.links.map((link) =>
    homePath(join(link.checkout.root, link.path), userHome),
  );

  const who = others.length
    ? `${first} and ${others.length} ${others.length === 1 ? "other" : "others"} link`
    : `${first} links`;

  const [subject, object] = others.length ? ["Each checkout", "them"] : ["The checkout", "it"];

  return `${who} to ${homePath(group.target, userHome)}. Let envden manage it? ${subject} will use envden's synced copy instead of that file, and later edits to the file won't reach ${object}.`;
}
```


### apps/cli/src/links/takeover/group.ts:21 :: callback@21

DONE

Ordered statements:

```ts
homePath(join(link.checkout.root, link.path), userHome)
```


### apps/cli/src/links/takeover/group.ts:35 :: byDestination

PENDING

Ordered statements:

```ts
{
  return (
    Number(!!a.checkout.registeredWorktree) - Number(!!b.checkout.registeredWorktree) ||
    join(a.checkout.root, a.path).localeCompare(join(b.checkout.root, b.path))
  );
}
```


### apps/cli/src/links/takeover/offer.ts:11 :: offerTakeover

DONE

Ordered statements:

```ts
{
  const home = await realHome(adapters.userHome);
  const left: IOwnLink[] = [];

  for (const group of groupOwnLinks(links))
    if ((await regularTarget(group.target)) && (await ask(takeoverQuestion(group, home))))
      left.push(...(await adoptGroup(adapters, state, group, copy)));
    else left.push(...group.links);

  return left;
}
```


### apps/cli/src/links/takeover/offer.ts:29 :: askInTerminal

DONE

Ordered statements:

```ts
{
  return !!process.stdin.isTTY && consent(question, true);
}
```


### apps/cli/src/links/takeover/sibling.ts:5 :: siblingLink

DONE

Ordered statements:

```ts
{
  const destination = join(own.checkout.root, own.path);
  const target = relative(own.checkout.root, resolve(dirname(destination), own.link));

  return envFiles.includes(target.split(sep).join("/"));
}
```


### apps/cli/src/links/takeover/target.ts:4 :: regularTarget

DONE

Ordered statements:

```ts
{
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}
```


### apps/cli/src/links/takeover/target.ts:5 :: callback@5

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/links/takeover/target.ts:8 :: readTarget

DONE

Ordered statements:

```ts
{
  return (await regularTarget(path)) ? readFile(path).catch(() => undefined) : undefined;
}
```


### apps/cli/src/links/takeover/target.ts:9 :: callback@9

DONE

Ordered statements:

```ts
undefined
```


### apps/cli/src/main.ts:15 :: runCli

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  try {
    await withUpdateStatus(createAdapters(undefined, now).home, () =>
      createProgram(now).parseAsync(),
    );
  } catch (error) {
    if (isEnvdenError(error) && error.code === "CLIENT_TOO_OLD")
      await recordUpdateRequired(createAdapters(undefined, now).home, error, now);

    console.error(sanitizeTerminal(error instanceof Error ? error.message : "Command failed"));
    process.exitCode = isEnvdenError(error) ? errorExitCode(error.code) : 1;

    await reportProblem(error, createAdapters(undefined, now));
  }
}
```


### apps/cli/src/main.ts:17 :: callback@17

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
createProgram(now).parseAsync()
```


### apps/cli/src/main.ts:34 :: callback@34

PENDING

Ordered statements:

```ts
runCli(Date.now)
```


### apps/cli/src/output/errors.ts:4 :: withTerminalErrors

PENDING

Ordered statements:

```ts
{
  const log = console.log;
  const info = console.info;
  const table = console.table;
  console.log = (...values: unknown[]) => log(...values.map(sanitizeValue));
  console.info = (...values: unknown[]) => info(...values.map(sanitizeValue));

  console.table = (data: unknown, properties?: string[]) =>
    properties
      ? table(sanitizeValue(data), properties.map(sanitizeTerminal))
      : table(sanitizeValue(data));

  const report = console.error;
  console.error = (...values: unknown[]) => report(sanitizeTerminal(format(...values)));

  try {
    return await action();
  } finally {
    console.error = report;
    console.log = log;
    console.info = info;
    console.table = table;
  }
}
```


### apps/cli/src/output/errors.ts:8 :: callback@8

PENDING

Ordered statements:

```ts
log(...values.map(sanitizeValue))
```


### apps/cli/src/output/errors.ts:9 :: callback@9

PENDING

Ordered statements:

```ts
info(...values.map(sanitizeValue))
```


### apps/cli/src/output/errors.ts:11 :: callback@11

PENDING

Ordered statements:

```ts
properties
      ? table(sanitizeValue(data), properties.map(sanitizeTerminal))
      : table(sanitizeValue(data))
```


### apps/cli/src/output/errors.ts:17 :: callback@17

PENDING

Ordered statements:

```ts
report(sanitizeTerminal(format(...values)))
```


### apps/cli/src/output/errors.ts:29 :: sanitizeValue

PENDING

Ordered statements:

```ts
{
  if (typeof value === "string") return sanitizeConsole(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);

  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [sanitizeTerminal(key), sanitizeValue(item)]),
    );

  return value;
}
```


### apps/cli/src/output/errors.ts:35 :: callback@35

PENDING

Ordered statements:

```ts
[sanitizeTerminal(key), sanitizeValue(item)]
```


### apps/cli/src/output/exit-code.ts:3 :: errorExitCode

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (code === "STORAGE_QUOTA") return 1;

  if (code === "CONFLICT") return 3;

  if (code === "INVALID_INPUT" || code === "NOT_IMPLEMENTED") return 2;

  return 1;
}
```


### apps/cli/src/output/home-path.ts:4 :: homePath

PENDING: dotted and relative path normalization differs.

Ordered statements:

```ts
{
  const rest = relative(userHome, path);

  if (rest === "") return "~";
  if (rest === ".." || rest.startsWith(`..${sep}`) || isAbsolute(rest)) return path;

  return `~${sep}${rest}`;
}
```


### apps/cli/src/output/home-path.ts:14 :: realHome

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  return realpath(userHome).catch(() => userHome);
}
```


### apps/cli/src/output/home-path.ts:15 :: callback@15

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
userHome
```


### apps/cli/src/output/progress/scan.ts:10 :: callback@10

PENDING

Ordered statements:

```ts
{}
```


### apps/cli/src/output/progress/scan.ts:10 :: callback@10

PENDING

Ordered statements:

```ts
{}
```


### apps/cli/src/output/progress/scan.ts:10 :: callback@10

PENDING

Ordered statements:

```ts
{}
```


### apps/cli/src/output/progress/scan.ts:12 :: scanProgress

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (!enabled) return silent;

  const indicator = spinner();
  const label = `Looking for repos in ${sanitizeTerminal(where)} …`;
  indicator.start(`${label} 0 found`);

  return {
    found: (count) => indicator.message(`${label} ${count} found`),
    done: (count) =>
      indicator.stop(`Found ${count} ${count === 1 ? "repo" : "repos"} with env files`),
    abort: () => indicator.clear(),
  };
}
```


### apps/cli/src/output/progress/scan.ts:20 :: callback@20

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
indicator.message(`${label} ${count} found`)
```


### apps/cli/src/output/progress/scan.ts:21 :: callback@21

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
indicator.stop(`Found ${count} ${count === 1 ? "repo" : "repos"} with env files`)
```


### apps/cli/src/output/progress/scan.ts:23 :: callback@23

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
indicator.clear()
```


### apps/cli/src/output/prompts/device-name.ts:4 :: askDeviceName

PENDING

Ordered statements:

```ts
{
  if (name !== undefined) return name;

  const suggested = suggestedDeviceName(hostname);

  return interactive ? input("Device name", true, suggested) : suggested;
}
```


### apps/cli/src/output/prompts/questions.ts:8 :: answer

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (typeof value === "symbol") throw new PromptCancelled();

  return value;
}
```


### apps/cli/src/output/prompts/questions.ts:14 :: terminal

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (!process.stdin.isTTY)
    throw new EnvdenError(
      "INVALID_INPUT",
      `${label.replace(/[?:.]+$/, "")} needs a terminal. Run this command in your own terminal`,
    );
}
```


### apps/cli/src/output/prompts/questions.ts:22 :: secret

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  terminal(message);

  return answer<string>(
    await password({
      message: sanitizeTerminal(message),
      validate: (value) => (value ? check(value) : "Required"),
    }),
  );
}
```


### apps/cli/src/output/prompts/questions.ts:22 :: callback@22

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
undefined
```


### apps/cli/src/output/prompts/questions.ts:28 :: callback@28

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
(value ? check(value) : "Required")
```


### apps/cli/src/output/prompts/questions.ts:33 :: input

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  terminal(message);

  return answer<string>(
    await text({
      message: sanitizeTerminal(message),
      ...(initialValue === undefined ? {} : { initialValue }),
      validate: (value) => (value ? check(value) : required ? "Required" : undefined),
    }),
  );
}
```


### apps/cli/src/output/prompts/questions.ts:37 :: callback@37

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
undefined
```


### apps/cli/src/output/prompts/questions.ts:45 :: callback@45

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
(value ? check(value) : required ? "Required" : undefined)
```


### apps/cli/src/output/prompts/questions.ts:50 :: consent

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  terminal(message);

  return answer<boolean>(await confirm({ message: sanitizeTerminal(message), initialValue }));
}
```


### apps/cli/src/output/prompts/questions.ts:56 :: shellChoice

PENDING

Ordered statements:

```ts
{
  const message =
    "Install the shell notice? It prints a line when you cd into a checkout whose env files need a push or pull";

  terminal(message);

  return answer<"zsh" | "bash" | "fish" | "powershell" | "none">(
    await select({
      message,
      options: [
        { value: "zsh" as const, label: "zsh" },
        { value: "bash" as const, label: "bash" },
        { value: "fish" as const, label: "fish" },
        { value: "powershell" as const, label: "PowerShell" },
        { value: "none" as const, label: "No, skip it" },
      ],
    }),
  );
}
```


### apps/cli/src/output/prompts/questions.ts:76 :: chooseResolution

PENDING

Ordered statements:

```ts
{
  const message = `${sanitizeTerminal(path)} differs from the server's copy`;
  terminal(message);

  return answer<"keep-mine" | "take-server" | "merge">(
    await select({
      message,
      options: [
        { value: "keep-mine" as const, label: "Keep mine" },
        { value: "take-server" as const, label: "Take the server's" },
        { value: "merge" as const, label: "Merge both" },
      ],
    }),
  );
}
```


### apps/cli/src/output/prompts/questions.ts:94 :: choose

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  terminal(message);

  const choice = await select<string>({
    message: sanitizeTerminal(message),
    ...(initialValue === undefined ? {} : { initialValue }),
    options: options.map((option) => ({ ...option, label: sanitizeTerminal(option.label) })),
  });

  // Only values from options can come back.
  return answer<string>(choice) as T;
}
```


### apps/cli/src/output/prompts/questions.ts:104 :: callback@104

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
({ ...option, label: sanitizeTerminal(option.label) })
```


### apps/cli/src/output/prompts/questions.ts:111 :: chooseMany

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  terminal(message);

  const result = await multiselect({
    message: sanitizeTerminal(message),
    required: false,
    initialValues: options.map((option) => option.value),
    options: options.map((option) => ({ ...option, label: sanitizeTerminal(option.label) })),
  });

  if (typeof result === "symbol") throw new PromptCancelled();

  return result;
}
```


### apps/cli/src/output/prompts/questions.ts:120 :: callback@120

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
option.value
```


### apps/cli/src/output/prompts/questions.ts:121 :: callback@121

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
({ ...option, label: sanitizeTerminal(option.label) })
```


### apps/cli/src/output/prompts/token.ts:8 :: readToken

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (source.isTTY && value === undefined)
    return secret(LABEL[kind], (text) => (isToken(kind, text) ? undefined : `Not a ${kind} token`));

  const token = value ?? (await piped(source));
  decodeToken(kind, token);

  return token;
}
```


### apps/cli/src/output/prompts/token.ts:14 :: callback@14

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
(isToken(kind, text) ? undefined : `Not a ${kind} token`)
```


### apps/cli/src/output/prompts/token.ts:22 :: piped

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  const token = Buffer.concat(chunks).toString("utf8").trim();

  if (!token)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Provide the token on stdin or use the prompt in a terminal",
    );

  return token;
}
```


### apps/cli/src/output/quiet-commands.ts:4 :: skipsNotices

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return json || QUIET.has(name);
}
```


### apps/cli/src/output/render/devices/device-list.ts:6 :: deviceListText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (!devices.length) return "No devices";

  const width = Math.max(...devices.map((device) => device.name.length));

  return sanitizeConsole(
    devices
      .map((device) => {
        const details = deviceDetails(device, verbose).join(" · ");

        return `${device.current ? "*" : " "} ${device.name.padEnd(width)}  ${details}`.trimEnd();
      })
      .join("\n"),
  );
}
```


### apps/cli/src/output/render/devices/device-list.ts:9 :: callback@9

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
device.name.length
```


### apps/cli/src/output/render/devices/device-list.ts:13 :: callback@13

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
        const details = deviceDetails(device, verbose).join(" · ");

        return `${device.current ? "*" : " "} ${device.name.padEnd(width)}  ${details}`.trimEnd();
      }
```


### apps/cli/src/output/render/devices/device-list.ts:22 :: deviceDetails

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return [
    ...(device.current ? ["this device"] : []),
    device.unconfirmed
      ? "not confirmed yet"
      : device.clientVersion
        ? `v${device.clientVersion}`
        : "version unknown",
    ...(device.recoveryKeyHeld ? ["has held the recovery keys"] : []),
    ...(verbose ? [`id ${device.id}`] : []),
  ];
}
```


### apps/cli/src/output/render/devices/devices.ts:4 :: exposureText

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  const lines = exposure.files.length
    ? [
        "This device could read:",
        ...exposure.files.map((file) => `  ${file.repoId}/${file.path}: ${file.keys.join(", ")}`),
        "It may have kept copies, so change these values where they're issued.",
      ]
    : ["This device couldn't read any env files."];

  if (exposure.incomplete)
    lines.push("Some history couldn't be read, so this list may be incomplete.");

  return sanitizeConsole(lines.join("\n"));
}
```


### apps/cli/src/output/render/devices/devices.ts:8 :: callback@8

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
`  ${file.repoId}/${file.path}: ${file.keys.join(", ")}`
```


### apps/cli/src/output/render/devices/devices.ts:19 :: pairingText

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  return sanitizeConsole(
    [
      `On the new device run: envden join ${address}`,
      `and enter code ${code} (valid 10 minutes). Keep this running.`,
    ].join("\n"),
  );
}
```


### apps/cli/src/output/render/devices/devices.ts:28 :: pairedText

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  if (kind === "declined") return "Declined";

  return sanitizeConsole(name ? `Device ${name} added` : "Device added");
}
```


### apps/cli/src/output/render/devices/kit.ts:9 :: printKit

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const lines = [
    "Recovery kit",
    "Keep it somewhere safe and offline, like a passport. With your master password it opens the vault if you lose every device, so never write the password on it.",
    "",
    `  Vault ID:    ${kit.vaultId}`,
    `  Secret key:  ${kit.secretKey}`,
    `  Server:      ${kit.server}`,
  ];

  console.log(sanitizeConsole(lines.join("\n")));
}
```


### apps/cli/src/output/render/devices/kit.ts:22 :: printKitSaved

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const lines = [`Recovery kit saved to ${path}`];

  if (format === "pdf")
    lines.push("Print it or store it offline, then delete the file from this computer.");

  console.log(sanitizeConsole(lines.join("\n")));
}
```


### apps/cli/src/output/render/devices/summary.ts:5 :: setupSummary

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const files = syncedFiles(state, userHome);
  const server = state.server?.address ?? "the server";
  const tracking = files ? `tracking ${files}` : "tracking no env files yet";

  return [
    sanitizeTerminal(
      `Setup complete. Vault on ${server}, this device is ${state.deviceName}, ${tracking}.`,
    ),
    files
      ? "Add another device with: envden device add"
      : "Track a checkout with: envden track <path>",
  ];
}
```


### apps/cli/src/output/render/devices/summary.ts:20 :: joinSummary

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const files = syncedFiles(state, userHome);

  return [
    sanitizeTerminal(
      `Joined as ${state.deviceName}. ${files ? `Synced ${files}.` : "No env files synced yet."}`,
    ),
  ];
}
```


### apps/cli/src/output/render/devices/summary.ts:30 :: syncedFiles

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const links = state.links.filter((link) => !link.localOnly);
  if (!links.length) return undefined;

  const roots = [...new Set(links.map((link) => homePath(link.root, userHome)))];
  const where = roots.length > 3 ? `${roots.length} checkouts` : roots.join(", ");

  return `${links.length} env ${links.length === 1 ? "file" : "files"} in ${where}`;
}
```


### apps/cli/src/output/render/devices/summary.ts:31 :: callback@31

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
!link.localOnly
```


### apps/cli/src/output/render/devices/summary.ts:34 :: callback@34

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
homePath(link.root, userHome)
```


### apps/cli/src/output/render/doctor.ts:6 :: doctorText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const shells = report.shells.filter((shell) => shell.installed);

  const lines = [
    report.keys.ownerOnly
      ? pass(`Keys: private files in ${report.keys.location} (owner-only, like ~/.ssh)`)
      : fail(
          `Keys: other users can read key files in ${report.keys.location}; run chmod -R go-rwx ${report.keys.location}`,
        ),
    report.symlinks ? pass("Symlinks work") : warn("Symlinks unavailable; checkouts get copies"),
    updateLine(report.update),
    tailscaleLine(report.tailscale),
    report.https.kind === "ready"
      ? pass("HTTPS certificates enabled")
      : fail(`HTTPS certificates: ${report.https.message}`),
    ...(shells.length
      ? shells.map((shell) => pass(`Shell notice: ${shell.shell} (${shell.path})`))
      : [warn("Shell notice: not installed; run envden shell install")]),
  ];

  return sanitizeConsole(lines.join("\n"));
}
```


### apps/cli/src/output/render/doctor.ts:7 :: callback@7

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
shell.installed
```


### apps/cli/src/output/render/doctor.ts:22 :: callback@22

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
pass(`Shell notice: ${shell.shell} (${shell.path})`)
```


### apps/cli/src/output/render/doctor.ts:29 :: updateLine

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const note = update.message ? ` (${update.message})` : "";

  if (update.required) return fail(`Update required; run envden update${note}`);
  if (update.available) return warn(`Update available; run envden update${note}`);

  return update.message ? warn(update.message) : pass("envden is up to date");
}
```


### apps/cli/src/output/render/doctor.ts:38 :: tailscaleLine

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (status.ready)
    return pass(
      status.hostname ? `Tailscale: connected as ${status.hostname}` : "Tailscale: connected",
    );

  return fail(`Tailscale: ${status.problem?.message ?? statusProblem(status)}`);
}
```


### apps/cli/src/output/render/doctor.ts:47 :: statusProblem

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (!status.running) return "not running";

  return status.loggedIn ? "not ready" : "not logged in";
}
```


### apps/cli/src/output/render/doctor.ts:53 :: pass

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return `✓ ${text}`;
}
```


### apps/cli/src/output/render/doctor.ts:57 :: warn

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return `! ${text}`;
}
```


### apps/cli/src/output/render/doctor.ts:61 :: fail

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return `✗ ${text}`;
}
```


### apps/cli/src/output/render/repair.ts:6 :: repairText

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  return sanitizeConsole(repairLines(result).join("\n"));
}
```


### apps/cli/src/output/render/repair.ts:10 :: repairLines

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  switch (result.kind) {
    case "missing-reports":
      return [
        `Waiting for ${result.devices.join(", ")} to run envden server repair.`,
        "Run it on each, or finish without them using --without <device>; they rejoin as new devices.",
      ];
    case "missing-blobs":
      return [
        ...(result.missing.length
          ? [
              `Waiting for uploads of ${fileNames(result.missing)}.`,
              "Run envden server repair on the devices that have them, then finish again.",
            ]
          : []),
        ...(result.lost.length
          ? [
              `No device has the newest version of ${fileNames(result.lost)}.`,
              "Check those files, then finish with --accept-lost to use the newest older version.",
            ]
          : []),
      ];
    case "finished":
      return [
        "Server restore finished",
        ...(result.report ? ["", result.report] : []),
        ...(result.replaceKit
          ? ["The restored server can't vouch for the current recovery kit; replace it."]
          : []),
      ];
  }
}
```


### apps/cli/src/output/render/repair.ts:43 :: fileNames

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  return files.map((file) => `${file.repoId}/${file.path}`).join(", ");
}
```


### apps/cli/src/output/render/repair.ts:44 :: callback@44

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
`${file.repoId}/${file.path}`
```


### apps/cli/src/output/render/scan/details.ts:7 :: repoSkipLine

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return sanitizeTerminal(`${homePath(skip.path, userHome)}: skipped: ${skip.reason}`);
}
```


### apps/cli/src/output/render/scan/details.ts:11 :: ownLinkLine

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const shown = homePath(join(link.checkout.root, link.path), userHome);

  return `envden: skipped ${sanitizeTerminal(shown)}: it links to ${sanitizeTerminal(link.link)}, and envden only syncs files it owns`;
}
```


### apps/cli/src/output/render/scan/summary.ts:7 :: skippedSummary

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const parts = [
    counted(counts.remote, "repo without a usable git remote", "repos without a usable git remote"),
    counted(counts.identity, "repo envden couldn't identify", "repos envden couldn't identify"),
    counted(
      counts.ownLinks,
      "env file that is your own symlink",
      "env files that are your own symlinks",
    ),
  ].filter((part) => part !== undefined);

  if (!parts.length) return undefined;

  const total = (counts.remote ?? 0) + (counts.identity ?? 0) + (counts.ownLinks ?? 0);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];

  return `Skipped ${list}. Run ${command} --verbose to list ${total === 1 ? "it" : "them"}.`;
}
```


### apps/cli/src/output/render/scan/summary.ts:16 :: callback@16

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
part !== undefined
```


### apps/cli/src/output/render/scan/summary.ts:26 :: counted

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return count ? `${count} ${count === 1 ? one : many}` : undefined;
}
```


### apps/cli/src/output/render/settings.ts:20 :: configText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return LOCAL.map((key) => settingText(key, config, env)).join("\n");
}
```


### apps/cli/src/output/render/settings.ts:21 :: callback@21

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
settingText(key, config, env)
```


### apps/cli/src/output/render/settings.ts:24 :: settingText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  switch (key) {
    case "telemetry":
      return toggleText(key, config.telemetry, telemetryEnabled(config.telemetry, env));
    case "update-check":
      return toggleText(
        key,
        config["update-check"],
        updateCheckEnabled(config["update-check"], env),
      );
    case "agent-merge":
    case "auto-approve-worktrees":
      return toggleText(key, config[key], config[key]);
    case "placement":
      return listText(
        key,
        Object.entries(config.placement ?? {}).map(([root, mode]) => `${root}: ${mode}`),
      );
    case "env-files":
      return listText(
        key,
        Object.entries(config["env-files"] ?? {}).map(
          ([name, patterns]) => `${name}: ${patterns.join(", ")}`,
        ),
      );
  }
}
```


### apps/cli/src/output/render/settings.ts:44 :: callback@44

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
`${root}: ${mode}`
```


### apps/cli/src/output/render/settings.ts:50 :: callback@50

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
`${name}: ${patterns.join(", ")}`
```


### apps/cli/src/output/render/settings.ts:56 :: unlockPeriodText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return `unlock-period: ${period === null ? "never" : `${period / millisecondsInDay}d`}`;
}
```


### apps/cli/src/output/render/settings.ts:60 :: toggleText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const value = effective ? "on" : "off";

  return configured === effective
    ? `${key}: ${value}`
    : `${key}: ${value} (set to ${configured ? "on" : "off"}; the environment overrides it)`;
}
```


### apps/cli/src/output/render/settings.ts:68 :: listText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (!lines.length) return `${key}: default`;

  return sanitizeConsole([`${key}:`, ...lines.map((line) => `  ${line}`)].join("\n"));
}
```


### apps/cli/src/output/render/settings.ts:71 :: callback@71

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
`  ${line}`
```


### apps/cli/src/output/render/sync/conflicts.ts:16 :: conflictNotice

PENDING

Ordered statements:

```ts
{
  const { path, file } = notice;

  const next = notice.marked
    ? `Edit ${file}, then run envden resolve ${path}`
    : `Run envden resolve ${path} with --keep-mine or --take-server, or edit ${file} first`;

  return `Conflict in ${path}: ${conflictCause(notice)}. ${next}`;
}
```


### apps/cli/src/output/render/sync/conflicts.ts:26 :: conflictCause

PENDING

Ordered statements:

```ts
{
  const where = notice.device ?? "the server";

  if (notice.theirs === "absent") return "this device has two different versions";
  if (notice.theirs === "tombstone") return `deleted on ${where} and changed here`;
  if (notice.mine === "deleted") return `deleted here and changed on ${where}`;
  if (notice.keys?.length) return `${notice.keys.join(", ")} changed here and on ${where}`;

  return `changed here and on ${where}`;
}
```


### apps/cli/src/output/render/sync/conflicts.ts:37 :: conflictsText

PENDING

Ordered statements:

```ts
{
  if (!records.length) return "No conflicts";

  const lines = records.map((record) =>
    [
      `  ${join(record.root, record.path)}${sideNote(record)}`,
      `    edit ${record.file}`,
      ...record.alternatives.map((path) => `    saved ${savedSource(record, path)}: ${path}`),
    ].join("\n"),
  );

  return sanitizeConsole(
    [
      "Conflicts:",
      ...lines,
      "Edit the file, then run envden resolve <file>, or pass --keep-mine or --take-server",
    ].join("\n"),
  );
}
```


### apps/cli/src/output/render/sync/conflicts.ts:40 :: callback@40

PENDING

Ordered statements:

```ts
[
      `  ${join(record.root, record.path)}${sideNote(record)}`,
      `    edit ${record.file}`,
      ...record.alternatives.map((path) => `    saved ${savedSource(record, path)}: ${path}`),
    ].join("\n")
```


### apps/cli/src/output/render/sync/conflicts.ts:44 :: callback@44

PENDING

Ordered statements:

```ts
`    saved ${savedSource(record, path)}: ${path}`
```


### apps/cli/src/output/render/sync/conflicts.ts:57 :: resolvedText

PENDING

Ordered statements:

```ts
{
  return sanitizeConsole(
    [
      `Resolved ${result.path}`,
      ...result.placementReports,
      ...(result.preserved.length ? [`Backups saved in ${result.backups}`] : []),
    ].join("\n"),
  );
}
```


### apps/cli/src/output/render/sync/conflicts.ts:68 :: savedSource

PENDING

Ordered statements:

```ts
{
  const index = Number(/\.variant-(\d+)$/.exec(path)?.[1]);
  if (index === 0) return "this device";
  if (index === 1) return "server";
  const target = record.targets[index - 2];

  return target ? join(target.root, record.path) : "copy";
}
```


### apps/cli/src/output/render/sync/conflicts.ts:77 :: sideNote

PENDING

Ordered statements:

```ts
{
  if (record.deleted) return " (deleted on the server)";

  return record.mineDeleted ? " (deleted here)" : "";
}
```


### apps/cli/src/output/render/sync/diff.ts:7 :: diffText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const changed = files.filter((file) => file.differs);

  if (!changed.length) return "No changes since the last sync";

  return sanitizeConsole(changed.map(fileText).join("\n\n"));
}
```


### apps/cli/src/output/render/sync/diff.ts:8 :: callback@8

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
file.differs
```


### apps/cli/src/output/render/sync/diff.ts:15 :: fileText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const name = join(file.root, file.path);

  if (file.kind === "conflict")
    return `${name}\n  can't compare keys: ${file.reason.replaceAll("-", " ")}`;

  const lines = [
    ...file.added.map((key) => `  + ${key}`),
    ...file.removed.map((key) => `  - ${key}`),
    ...file.changed.map((key) => `  ~ ${key}`),
  ];

  return [name, ...(lines.length ? lines : ["  only comments or formatting changed"])].join("\n");
}
```


### apps/cli/src/output/render/sync/diff.ts:22 :: callback@22

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
`  + ${key}`
```


### apps/cli/src/output/render/sync/diff.ts:23 :: callback@23

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
`  - ${key}`
```


### apps/cli/src/output/render/sync/diff.ts:24 :: callback@24

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
`  ~ ${key}`
```


### apps/cli/src/output/render/sync/status.ts:25 :: statusText

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const lines = report.configured ? configuredLines(report, place) : [NOT_SET_UP];

  if (report.update.message) lines.push(report.update.message);

  return sanitizeConsole(lines.join("\n"));
}
```


### apps/cli/src/output/render/sync/status.ts:33 :: configuredLines

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const tracked = report.files.filter((file) => file.state !== "local-only");
  const name = (file: TFile) => displayPath(join(file.root, file.path), place);

  const pending = [
    ...groups.flatMap(([states, label]) => {
      const files = tracked.filter((file) => states.includes(file.state));

      return files.length ? [`${label}: ${files.map(name).join(", ")}`] : [];
    }),
    ...tracked
      .filter((file) => file.state === "held-back")
      .map((file) => `Held back: ${name(file)}: ${file.reason ?? "run envden doctor"}`),
  ];

  if (!pending.length && report.server === "reachable" && report.serverChecked)
    return [
      tracked.length
        ? `In sync: ${countText(tracked)}. Server reachable.`
        : "Nothing tracked yet. Run envden track in a checkout.",
    ];

  return [serverLine(report), ...(pending.length ? pending : ["No changes here"])];
}
```


### apps/cli/src/output/render/sync/status.ts:34 :: callback@34

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
file.state !== "local-only"
```


### apps/cli/src/output/render/sync/status.ts:35 :: name

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
displayPath(join(file.root, file.path), place)
```


### apps/cli/src/output/render/sync/status.ts:38 :: callback@38

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
      const files = tracked.filter((file) => states.includes(file.state));

      return files.length ? [`${label}: ${files.map(name).join(", ")}`] : [];
    }
```


### apps/cli/src/output/render/sync/status.ts:39 :: callback@39

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
states.includes(file.state)
```


### apps/cli/src/output/render/sync/status.ts:44 :: callback@44

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
file.state === "held-back"
```


### apps/cli/src/output/render/sync/status.ts:45 :: callback@45

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
`Held back: ${name(file)}: ${file.reason ?? "run envden doctor"}`
```


### apps/cli/src/output/render/sync/status.ts:58 :: serverLine

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  if (report.server !== "reachable") return `Server: ${report.server} (${report.serverReason})`;

  return report.serverChecked
    ? "Server: reachable"
    : "Server: reachable, but couldn't check it for newer changes";
}
```


### apps/cli/src/output/render/sync/status.ts:66 :: countText

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const repos = new Set(files.map((file) => file.repoId ?? file.root)).size;

  return `${plural(repos, "repo")}, ${plural(files.length, "env file")}`;
}
```


### apps/cli/src/output/render/sync/status.ts:67 :: callback@67

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
file.repoId ?? file.root
```


### apps/cli/src/output/render/sync/status.ts:72 :: plural

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
```


### apps/cli/src/output/render/sync/status.ts:76 :: displayPath

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const fromCwd = relative(place.cwd, path);
  const inside = fromCwd !== ".." && !fromCwd.startsWith(`..${sep}`) && !isAbsolute(fromCwd);

  return inside ? fromCwd : homePath(path, place.userHome);
}
```


### apps/cli/src/output/render/sync/sync.ts:1 :: syncText

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const verb = direction === "push" ? "Pushed" : "Pulled";
  const moved = result.changed ? `${verb} ${plural(result.changed, "file")}` : undefined;

  if (!result.conflicts) return moved ?? (direction === "push" ? "Nothing to push" : "Up to date");

  const pending = `${plural(result.conflicts, "conflict")} to resolve`;

  return moved ? `${moved}; ${pending}` : `${pending}; nothing ${verb.toLowerCase()}`;
}
```


### apps/cli/src/output/render/sync/sync.ts:15 :: plural

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
```


### apps/cli/src/output/sanitize.ts:1 :: sanitizeTerminal

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  // oxlint-disable-next-line no-control-regex -- Strip controls to prevent terminal and shell-notice injection.
  return value.replace(/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}
```


### apps/cli/src/output/sanitize.ts:6 :: terminalJson

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "string" ? sanitizeTerminal(item) : item,
  );
}
```


### apps/cli/src/output/sanitize.ts:7 :: callback@7

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
typeof item === "string" ? sanitizeTerminal(item) : item
```


### apps/cli/src/output/sanitize.ts:12 :: sanitizeConsole

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return value
    .split(/([\n\t])/)
    .map((part) => (part === "\n" || part === "\t" ? part : sanitizeTerminal(part)))
    .join("");
}
```


### apps/cli/src/output/sanitize.ts:15 :: callback@15

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
(part === "\n" || part === "\t" ? part : sanitizeTerminal(part))
```


### apps/cli/src/output/telemetry/background.ts:7 :: selfCommand

PENDING

Ordered statements:

```ts
{
  const compiled = /^(\/\$bunfs\/|[A-Z]:\\~BUN\\)/.test(argv[1] ?? "");

  return [execPath, ...(compiled ? [] : [argv[1]!]), TELEMETRY_SEND_COMMAND];
}
```


### apps/cli/src/output/telemetry/background.ts:14 :: sendInBackground

PENDING

Ordered statements:

```ts
{
  try {
    const child = spawnTrusted(selfCommand(process.argv, process.execPath), {
      stdout: "ignore",
      stderr: "ignore",
      env: childEnvironment(body),
    });

    child.unref();
  } catch {
    // telemetry never affects a command's outcome
  }
}
```


### apps/cli/src/output/telemetry/background.ts:35 :: callback@35

PENDING

Ordered statements:

```ts
[name, name.toLowerCase()]
```


### apps/cli/src/output/telemetry/background.ts:37 :: childEnvironment

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const passed = ["ENVDEN_HOME", ...NETWORK_SETTINGS].filter((name) => inherited[name]);

  return {
    [TELEMETRY_BODY]: body,
    ENVDEN_NO_UPDATE_CHECK: "1",
    ...Object.fromEntries(passed.map((name) => [name, inherited[name]!])),
  };
}
```


### apps/cli/src/output/telemetry/background.ts:41 :: callback@41

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
inherited[name]
```


### apps/cli/src/output/telemetry/background.ts:46 :: callback@46

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
[name, inherited[name]!]
```


### apps/cli/src/output/telemetry/background.ts:50 :: deliverTelemetry

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (!body) return;

  await fetch("https://us.i.posthog.com/capture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  }).catch(() => {});
}
```


### apps/cli/src/output/telemetry/background.ts:59 :: callback@59

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{}
```


### apps/cli/src/output/telemetry/report.ts:21 :: telemetryPayload

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const error = ErrorCodeSchema.safeParse(event.errorCode);

  return {
    event: "cli_command",
    properties: {
      distinct_id: id,
      version: VERSION,
      os: process.platform,
      command: event.command,
      success: event.success,
      ...(error.success ? { error_code: error.data } : {}),
      ...(Number.isSafeInteger(event.changed) && event.changed! >= 0
        ? { changed: event.changed }
        : {}),
      ...(Number.isSafeInteger(event.conflicts) && event.conflicts! >= 0
        ? { conflicts: event.conflicts }
        : {}),
      $ip: null,
      $geoip_disable: true,
    },
  };
}
```


### apps/cli/src/output/telemetry/report.ts:45 :: reportTelemetry

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const projectKey = TELEMETRY_KEY;
  if (!projectKey) return;

  try {
    const config = await readConfig(adapters.home);
    if (!telemetryEnabled(config.telemetry)) return;

    const id = await withStateLock(adapters.home, async () => {
      const path = join(adapters.home, "state", "install-id");
      const saved = await optionalRead(path);
      if (saved) return saved;
      const generated = crypto.randomUUID();
      await atomicWrite(path, generated, adapters.now);

      return generated;
    });

    send(JSON.stringify({ api_key: projectKey, ...telemetryPayload(id, event) }));
  } catch {
    // Telemetry never affects a command's outcome.
  }
}
```


### apps/cli/src/output/telemetry/report.ts:57 :: callback@57

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
      const path = join(adapters.home, "state", "install-id");
      const saved = await optionalRead(path);
      if (saved) return saved;
      const generated = crypto.randomUUID();
      await atomicWrite(path, generated, adapters.now);

      return generated;
    }
```


### apps/cli/src/output/telemetry/report.ts:73 :: commandOutcome

PENDING

Ordered statements:

```ts
{
  try {
    const result = await action();
    void report({ success: true }).catch(() => {});

    return result;
  } catch (cause) {
    void report({
      success: false,
      errorCode: isEnvdenError(cause) ? cause.code : "INTERNAL",
    }).catch(() => {});

    throw cause;
  }
}
```


### apps/cli/src/output/telemetry/report.ts:79 :: callback@79

PENDING

Ordered statements:

```ts
{}
```


### apps/cli/src/output/telemetry/report.ts:86 :: callback@86

PENDING

Ordered statements:

```ts
{}
```


### apps/cli/src/program.ts:38 :: createProgram

PENDING

Ordered statements:

```ts
{
  const program = new Command()
    .name("envden")
    .description("Encrypted whole-file env sync over your private network")
    .version(VERSION)
    .configureOutput({ outputError: (message, write) => write(sanitizeTerminal(message) + "\n") });

  let active: CommandUnknownOpts | undefined;

  program.hook("preAction", async (_program, command) => {
    const commandTime = now();

    const state = await loadState(createAdapters(undefined, now).home).catch(() => undefined);
    setUntrustedRoots(state?.approved.map((checkout) => checkout.root) ?? []);
    if (command.name() !== "status" || !command.opts().refreshCache) active = command;

    if (skipsNotices(command.name(), Boolean(command.opts().json))) return;

    try {
      const notice = await commandNotice(
        createAdapters(undefined, now),
        commandTime,
        fetch,
        false,
        process.cwd(),
      );

      reportCommandNotice(notice);
    } catch {
      // Notices must never prevent a command from running.
    }
  });

  addGroup(program, "Get started:", [setupCommand, joinCommand]);

  addGroup(program, "Daily use:", [
    statusCommand,
    pushCommand,
    pullCommand,
    diffCommand,
    resolveCommand,
    historyCommand,
  ]);

  addGroup(program, "Files:", [
    trackCommand,
    untrackCommand,
    localOnlyCommand,
    rmCommand,
    aliasCommand,
  ]);

  addGroup(program, "Devices and vault:", [
    deviceCommand,
    vaultCommand,
    serverCommand,
    unlockCommand,
  ]);

  addGroup(program, "Maintenance:", [
    configCommand,
    doctorCommand,
    updateCommand,
    uiCommand,
    agentCommand,
    shellCommand,
    serveCommand,
    versionCommand,
  ]);

  const parse = program.parseAsync.bind(program);

  program.parseAsync = async (...args) => {
    active = undefined;

    return commandCounts.run({}, async () => {
      return commandOutcome(
        () => parse(...args),
        async (outcome) => {
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        },
      );
    });
  };

  return program;
}
```


### apps/cli/src/program.ts:43 :: callback@43

PENDING

Ordered statements:

```ts
write(sanitizeTerminal(message) + "\n")
```


### apps/cli/src/program.ts:47 :: callback@47

PENDING

Ordered statements:

```ts
{
    const commandTime = now();

    const state = await loadState(createAdapters(undefined, now).home).catch(() => undefined);
    setUntrustedRoots(state?.approved.map((checkout) => checkout.root) ?? []);
    if (command.name() !== "status" || !command.opts().refreshCache) active = command;

    if (skipsNotices(command.name(), Boolean(command.opts().json))) return;

    try {
      const notice = await commandNotice(
        createAdapters(undefined, now),
        commandTime,
        fetch,
        false,
        process.cwd(),
      );

      reportCommandNotice(notice);
    } catch {
      // Notices must never prevent a command from running.
    }
  }
```


### apps/cli/src/program.ts:50 :: callback@50

PENDING

Ordered statements:

```ts
undefined
```


### apps/cli/src/program.ts:51 :: callback@51

PENDING

Ordered statements:

```ts
checkout.root
```


### apps/cli/src/program.ts:110 :: callback@110

PENDING

Ordered statements:

```ts
{
    active = undefined;

    return commandCounts.run({}, async () => {
      return commandOutcome(
        () => parse(...args),
        async (outcome) => {
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        },
      );
    });
  }
```


### apps/cli/src/program.ts:113 :: callback@113

PENDING

Ordered statements:

```ts
{
      return commandOutcome(
        () => parse(...args),
        async (outcome) => {
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        },
      );
    }
```


### apps/cli/src/program.ts:115 :: callback@115

PENDING

Ordered statements:

```ts
parse(...args)
```


### apps/cli/src/program.ts:116 :: callback@116

PENDING

Ordered statements:

```ts
{
          if (active)
            await reportTelemetry(createAdapters(undefined, now), {
              command: commandName(active),
              ...outcome,
              ...commandCounts.getStore(),
            });
        }
```


### apps/cli/src/program.ts:131 :: addGroup

PENDING

Ordered statements:

```ts
{
  program.commandsGroup(heading);
  for (const command of commands) program.addCommand(command);
}
```


### apps/cli/src/program.ts:136 :: reportCommandNotice

PENDING

Ordered statements:

```ts
{
  for (const repo of notice.repos) console.error(`envden: ${repo} out of sync`);
  if (notice.update.available) console.error("envden: update available; run envden update");
  if (notice.update.required) console.error("envden: update required; run envden update");
}
```


### apps/cli/src/program.ts:142 :: commandName

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const names = [command.name()];
  let parent = command.parent;

  while (parent?.parent) {
    names.unshift(parent.name());
    parent = parent.parent;
  }

  return names.join(" ");
}
```


### apps/cli/src/settings/config.ts:28 :: parseConfig

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const result = configSchema.safeParse(value);

  if (!result.success)
    throw new EnvdenError("INVALID_INPUT", "Invalid config", { cause: result.error });

  return result.data;
}
```


### apps/cli/src/settings/config.ts:37 :: readConfig

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  try {
    const value: unknown = JSON.parse(await readFile(paths(home).config, "utf8"));

    return parseConfig(value);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return parseConfig({});

    if (error instanceof EnvdenError) throw error;
    throw new EnvdenError("INVALID_DATA", "Unreadable config", { cause: error });
  }
}
```


### apps/cli/src/settings/config.ts:51 :: setConfig

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (terminalOnly.includes(key) && value === "on" && !interactive)
    throw new EnvdenError("INVALID_INPUT", `Turning on ${key} requires a terminal`);

  return withStateLock(paths(home).home, async () => {
    const current = await readConfig(home);

    const next = parseConfig({
      ...current,
      [key]:
        key === "placement" || key === "env-files" ? parseStructured(value) : parseToggle(value),
    });

    const location = await ensurePaths(home);
    await atomicWrite(location.config, `${JSON.stringify(next, null, 2)}\n`, now);

    return next;
  });
}
```


### apps/cli/src/settings/config.ts:61 :: callback@61

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const current = await readConfig(home);

    const next = parseConfig({
      ...current,
      [key]:
        key === "placement" || key === "env-files" ? parseStructured(value) : parseToggle(value),
    });

    const location = await ensurePaths(home);
    await atomicWrite(location.config, `${JSON.stringify(next, null, 2)}\n`, now);

    return next;
  }
```


### apps/cli/src/settings/config.ts:77 :: parseToggle

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (value !== "on" && value !== "off")
    throw new EnvdenError("INVALID_INPUT", "Expected on or off");

  return value === "on";
}
```


### apps/cli/src/settings/config.ts:84 :: parseStructured

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  try {
    return JSON.parse(value);
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "Expected a JSON settings object", { cause });
  }
}
```


### apps/cli/src/settings/paths.ts:4 :: paths

PENDING

Ordered statements:

```ts
{
  const root = resolve(home);

  return {
    home: root,
    store: join(root, "store"),
    state: join(root, "state"),
    base: join(root, "base"),
    conflicts: join(root, "conflicts"),
    config: join(root, "config.json"),
  };
}
```


### apps/cli/src/settings/paths.ts:17 :: ensurePaths

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const result = paths(home);

  for (const directory of [
    result.home,
    result.store,
    result.state,
    result.base,
    result.conflicts,
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }

  return result;
}
```


### apps/cli/src/settings/placement.ts:6 :: setCheckoutPlacement

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (mode !== "link" && mode !== "copy")
    throw new EnvdenError("INVALID_INPUT", "Expected placement <checkout> link|copy");

  const checkout = await adapters.repo.checkoutAt(path);
  if (!checkout) throw new EnvdenError("NOT_FOUND", "Checkout not found");

  return withStateLock(adapters.home, async () => {
    const config = await readConfig(adapters.home);

    return setConfig(
      "placement",
      JSON.stringify({ ...config.placement, [checkout.root]: mode }),
      adapters.home,
      adapters.now,
    );
  });
}
```


### apps/cli/src/settings/placement.ts:17 :: callback@17

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const config = await readConfig(adapters.home);

    return setConfig(
      "placement",
      JSON.stringify({ ...config.placement, [checkout.root]: mode }),
      adapters.home,
      adapters.now,
    );
  }
```


### apps/cli/src/settings/privacy.ts:1 :: telemetryEnabled

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (env.ENVDEN_TELEMETRY === "0" || env.DO_NOT_TRACK === "1") return false;

  return configured ?? false;
}
```


### apps/cli/src/settings/privacy.ts:10 :: updateCheckEnabled

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  return configured && env.ENVDEN_NO_UPDATE_CHECK !== "1";
}
```


### apps/cli/src/settings/request.ts:12 :: settingRequest

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (key === undefined) return { kind: "list" } as const;

  if (!isSetting(key))
    throw new EnvdenError(
      "INVALID_INPUT",
      `Unknown setting '${key}'. Valid settings: ${SETTING_NAMES}`,
    );

  const [value, ...rest] = values;

  if (value === undefined) return { kind: "read", key } as const;

  if (key === "placement") {
    if (rest.length !== 1 || (rest[0] !== "link" && rest[0] !== "copy"))
      throw new EnvdenError("INVALID_INPUT", "Expected placement <checkout> link|copy");

    return { kind: "placement", checkout: value, mode: rest[0] } as const;
  }

  if (rest.length) throw new EnvdenError("INVALID_INPUT", `Expected one value for ${key}`);

  if (key === "unlock-period") {
    unlockPeriod(value);

    return { kind: "unlock-period", value } as const;
  }

  if (key !== "env-files" && value !== "on" && value !== "off")
    throw new EnvdenError("INVALID_INPUT", `Expected on or off for ${key}`);

  return { kind: "set", key, value } as const;
}
```


### apps/cli/src/settings/request.ts:46 :: isSetting

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return (SETTINGS as readonly string[]).includes(key);
}
```


### apps/cli/src/settings/unlock-period.ts:11 :: unlockPeriod

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  switch (value) {
    case "1d":
      return millisecondsInDay;
    case "7d":
      return millisecondsInWeek;
    case "30d":
      return milliseconds({ days: 30 });
    case "never":
      return null;
    default:
      throw new EnvdenError("INVALID_INPUT", "Expected 1d, 7d, 30d or never");
  }
}
```


### apps/cli/src/settings/unlock-period.ts:26 :: setUnlockPeriod

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const period = unlockPeriod(value);
  const state = requireConfigured(await loadState(adapters.home));
  const { client, vaultId } = await vaultConnection(adapters, state, now, adapters.fetcher);
  await login(client, vaultId, password);
  await client.request("/v1/settings/unlock-period", "PUT", { period });
}
```


### apps/cli/src/settings/unlock-period.ts:39 :: getUnlockPeriod

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const state = requireConfigured(await loadState(adapters.home));
  const { client } = await vaultConnection(adapters, state, now, adapters.fetcher);

  return UnlockPeriodSchema.parse(
    await (await client.request("/v1/settings/unlock-period")).json(),
  );
}
```


### apps/cli/src/state/cancelled.ts:4 :: callback@4

PENDING

Ordered statements:

```ts
{
    super("INVALID_INPUT", "Cancelled");
  }
```


### apps/cli/src/state/configured.ts:6 :: requireConfigured

PENDING

Ordered statements:

```ts
{
  if (state?.creationPending)
    throw new EnvdenError("CONFLICT", "Setup didn't finish. Run envden setup again to finish it");

  if (!state?.server || !state.vaultId) throw new EnvdenError("NOT_FOUND", message);

  return { ...state, server: state.server, vaultId: state.vaultId };
}
```


### apps/cli/src/state/journal/placement.ts:7 :: journalPlacement

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  const path = join(home, "state", "placement.json");
  const bytes = JSON.stringify({ checkpoint: state.checkpoint, links: state.links });
  if ((await optionalRead(path)) === bytes) return;
  await atomicWrite(path, bytes, now);
}
```


### apps/cli/src/state/journal/placement.ts:14 :: restorePlacement

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  const journal = await readSyncRecord<{ checkpoint: string; links: ILocalState["links"] }>(
    join(home, "state", "placement.json"),
    (saved) => JSON.parse(saved),
  );

  if (!journal) return;
  if (journal.checkpoint !== state.checkpoint || !Array.isArray(journal.links)) return;

  for (const link of journal.links) {
    if (!state.links.some((item) => item.root === link.root && item.path === link.path))
      state.links.push(link);
  }
}
```


### apps/cli/src/state/journal/placement.ts:17 :: callback@17

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
JSON.parse(saved)
```


### apps/cli/src/state/journal/placement.ts:24 :: callback@24

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
item.root === link.root && item.path === link.path
```


### apps/cli/src/state/journal/placement.ts:29 :: clearPlacement

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  await rm(join(home, "state", "placement.json"), { force: true });
}
```


### apps/cli/src/state/model.ts:39 :: emptyState

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  return {
    format: 1,
    deviceName,
    headers: [],
    entries: [],
    approved: [],
    links: [],
    aliases: {},
    telemetry: false,
    updateCheck: true,
  };
}
```


### apps/cli/src/state/store/files.ts:9 :: privateDirectory

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  await prepareDirectory(path);
  await restrictAccess(path, true);
  owned.add(resolve(path));
}
```


### apps/cli/src/state/store/files.ts:15 :: atomicWrite

PENDING

Ordered statements:

```ts
{
  const parent = dirname(path);

  if ([...owned].some((root) => placeInRoot(root, parent) !== "outside"))
    await privateDirectory(parent);
  else await prepareDirectory(parent);

  const temporary = join(
    dirname(path),
    `.${String(now()).padStart(13, "0")}_${crypto.randomUUID()}.tmp`,
  );

  try {
    const file = await open(temporary, "wx", 0o600);

    try {
      await restrictAccess(temporary, false);
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);

    if (process.platform !== "win32") {
      const directory = await open(dirname(path), "r");

      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
}
```


### apps/cli/src/state/store/files.ts:22 :: callback@22

PENDING

Ordered statements:

```ts
placeInRoot(root, parent) !== "outside"
```


### apps/cli/src/state/store/files.ts:58 :: optionalRead

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  try {
    const stat = await lstat(path);

    if (!stat.isFile() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_DATA", "Unsafe state file");

    return await readFile(path, "utf8");
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
}
```


### apps/cli/src/state/store/files.ts:72 :: prepareDirectory

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);

  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe state directory");
}
```


### apps/cli/src/state/store/headers.ts:6 :: storeHeaders

PENDING

Ordered statements:

```ts
{
  const refs: string[] = [];

  for (const header of headers) {
    const hash = createHash("sha256").update(header).digest("hex");
    const path = join(home, "state", "headers", hash);
    if ((await optionalRead(path)) === undefined) await atomicWrite(path, header, now);
    refs.push(hash);
  }

  return refs;
}
```


### apps/cli/src/state/store/headers.ts:19 :: restoreHeaders

PENDING

Ordered statements:

```ts
{
  return Promise.all(
    refs.map(async (hash) => {
      if (!/^[a-f0-9]{64}$/.test(hash))
        throw new EnvdenError("INVALID_DATA", "Invalid header reference");

      const header = await optionalRead(join(home, "state", "headers", hash));

      if (header === undefined || createHash("sha256").update(header).digest("hex") !== hash)
        throw new EnvdenError("INVALID_DATA", "Missing stored header");

      return header;
    }),
  );
}
```


### apps/cli/src/state/store/headers.ts:21 :: callback@21

PENDING

Ordered statements:

```ts
{
      if (!/^[a-f0-9]{64}$/.test(hash))
        throw new EnvdenError("INVALID_DATA", "Invalid header reference");

      const header = await optionalRead(join(home, "state", "headers", hash));

      if (header === undefined || createHash("sha256").update(header).digest("hex") !== hash)
        throw new EnvdenError("INVALID_DATA", "Missing stored header");

      return header;
    }
```


### apps/cli/src/state/store/real-location.ts:5 :: realLocation

PENDING

Ordered statements:

```ts
{
  const absolute = resolve(path);

  try {
    return realpathSync(absolute);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
    const parent = dirname(absolute);

    return parent === absolute ? absolute : join(realLocation(parent), basename(absolute));
  }
}
```


### apps/cli/src/state/store/records.ts:5 :: readSyncRecord

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  const saved = await optionalRead(path);
  if (saved === undefined) return undefined;

  try {
    return decode(saved);
  } catch {
    throw new EnvdenError(
      "INVALID_DATA",
      `Invalid sync state: ${path}; move this file aside and run envden pull`,
    );
  }
}
```


### apps/cli/src/state/store/records.ts:22 :: recoverSyncRecord

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
{
  try {
    return await readSyncRecord(path, decode);
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "INVALID_DATA") throw error;
    const backup = path + ".corrupt-" + String(now).padStart(13, "0") + "_" + crypto.randomUUID();
    await atomicWrite(marker, backup, () => now);
    await rename(path, backup);

    report?.(
      `Invalid sync state: ${path}; saved ${backup}; run envden pull, then envden resolve --list`,
    );

    return undefined;
  }
}
```


### apps/cli/src/state/store/records.ts:34 :: callback@34

DONE: direct ordered source comparison; state decoding/access fixes and regressions recorded below.

Ordered statements:

```ts
now
```


### apps/cli/src/state/store/records.ts:45 :: invalidSyncRecord

PENDING

Ordered statements:

```ts
{
  try {
    await readSyncRecord(path, decode);

    return false;
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "INVALID_DATA") return true;
    throw error;
  }
}
```


### apps/cli/src/state/store/repository.ts:31 :: replacer

PENDING

Ordered statements:

```ts
{
  if (value instanceof Map) return { $map: [...value] };
  if (value instanceof Set) return { $set: [...value] };
  if (typeof value === "bigint") return { $bigint: String(value) };
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString("base64url") };

  return value;
}
```


### apps/cli/src/state/store/repository.ts:40 :: reviver

PENDING

Ordered statements:

```ts
{
  if (value && typeof value === "object") {
    const collection = reviveCollection(value);
    if (collection) return collection;
    if ("$bigint" in value && typeof value.$bigint === "string") return BigInt(value.$bigint);

    if ("$bytes" in value && typeof value.$bytes === "string")
      return new Uint8Array(Buffer.from(value.$bytes, "base64url"));
  }

  return value;
}
```


### apps/cli/src/state/store/repository.ts:53 :: saveState

PENDING

Ordered statements:

```ts
{
  await withStateLock(home, async () => {
    await privateDirectory(home);
    const headerRefs = await storeHeaders(home, state.headers, now);
    const { headers: _headers, latest: _latest, ...record } = state;

    await atomicWrite(
      join(home, "state", "device.json"),
      JSON.stringify({ ...record, headerRefs }, replacer),
      now,
    );

    await clearPlacement(home);
  });
}
```


### apps/cli/src/state/store/repository.ts:58 :: callback@58

PENDING

Ordered statements:

```ts
{
    await privateDirectory(home);
    const headerRefs = await storeHeaders(home, state.headers, now);
    const { headers: _headers, latest: _latest, ...record } = state;

    await atomicWrite(
      join(home, "state", "device.json"),
      JSON.stringify({ ...record, headerRefs }, replacer),
      now,
    );

    await clearPlacement(home);
  }
```


### apps/cli/src/state/store/repository.ts:73 :: loadState

PENDING

Ordered statements:

```ts
{
  const text = await optionalRead(join(home, "state", "device.json"));
  if (text === undefined) return undefined;

  try {
    const value: Omit<ILocalState, "headers"> & { headerRefs: string[] } = JSON.parse(
      text,
      reviver,
    );

    if (
      value.format !== 1 ||
      !Array.isArray(value.headerRefs) ||
      !Array.isArray(value.entries) ||
      !Array.isArray(value.approved) ||
      !Array.isArray(value.links) ||
      typeof value.deviceName !== "string" ||
      !value.aliases ||
      typeof value.aliases !== "object" ||
      Array.isArray(value.aliases) ||
      typeof value.telemetry !== "boolean" ||
      typeof value.updateCheck !== "boolean" ||
      Object.keys(value).some((key) => !stateKeys.has(key))
    )
      throw new Error("Invalid state");

    const { headerRefs, ...record } = value;
    const state: ILocalState = { ...record, headers: await restoreHeaders(home, headerRefs) };
    const latest = (await readUpdateCache(home)).latest;
    if (latest) state.latest = latest;
    await restorePlacement(home, state);

    return state;
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Unreadable local state", { cause });
  }
}
```


### apps/cli/src/state/store/repository.ts:95 :: callback@95

PENDING

Ordered statements:

```ts
!stateKeys.has(key)
```


### apps/cli/src/state/store/repository.ts:111 :: reviveCollection

PENDING

Ordered statements:

```ts
{
  if ("$map" in value && Array.isArray(value.$map)) return new Map(value.$map);
  if ("$set" in value && Array.isArray(value.$set)) return new Set(value.$set);

  return undefined;
}
```


### apps/cli/src/ui/actions/options.ts:5 :: dashboardSyncOptions

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return { now, fetcher: adapters.fetcher, all: true, yes: true, interactive: false };
}
```


### apps/cli/src/ui/actions/restore.ts:11 :: dashboardRestoreOptions

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return {
    cwd: target.root,
    file: target.path,
    version: target.version,
    yes: true,
    interactive: true,
    confirm: () => Promise.resolve(true),
    now,
    fetcher: adapters.fetcher,
  };
}
```


### apps/cli/src/ui/actions/restore.ts:22 :: callback@22

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
Promise.resolve(true)
```


### apps/cli/src/ui/browser.ts:3 :: browserCommand

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (platform === "darwin") return ["open", url];
  if (platform === "win32") return ["rundll32", "url.dll,FileProtocolHandler", url];

  return ["xdg-open", url];
}
```


### apps/cli/src/ui/browser.ts:10 :: openBrowser

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  try {
    const child = spawnTrusted(browserCommand(process.platform, url), {
      stdout: "ignore",
      stderr: "ignore",
    });

    return (await child.exited) === 0;
  } catch {
    return false;
  }
}
```


### apps/cli/src/ui/page/api.ts:1 :: createApi

DONE

Ordered statements:

```ts
{
  return async function call<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(json));

    return json as T;
  };
}
```


### apps/cli/src/ui/page/api.ts:2 :: call

DONE

Ordered statements:

```ts
{
    const response = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(json));

    return json as T;
  }
```


### apps/cli/src/ui/page/api.ts:12 :: callback@12

DONE

Ordered statements:

```ts
({})
```


### apps/cli/src/ui/page/api.ts:19 :: errorMessage

DONE

Ordered statements:

```ts
{
  return json && typeof json === "object" && "message" in json && typeof json.message === "string"
    ? json.message
    : "Request failed";
}
```


### apps/cli/src/ui/page/history.ts:16 :: createHistory

DONE

Ordered statements:

```ts
{
  let pane: IHistoryPane | undefined;

  const load = (root: string, path: string) =>
    call<IHistoryView>(`history?${new URLSearchParams({ root, path }).toString()}`);

  const draw = () => {
    byId("history-section").hidden = !pane;
    byId("history").replaceChildren(...(pane ? [historyPane(pane, actions)] : []));
  };

  const update = (change: Partial<IHistoryPane>) => {
    if (pane) pane = { ...pane, ...change };
    draw();
  };

  const actions = {
    ask: (version: number) => update({ asking: version, outcome: undefined }),
    cancel: () => update({ asking: undefined }),
    restore: (version: number) => void restore(version),
    close: () => {
      pane = undefined;
      draw();
    },
  };

  async function restore(version: number) {
    if (!pane) return;
    const { root, file } = pane;

    await busy(`Restoring v${version} of ${file.path}...`, async () => {
      try {
        const result = await call<IRestoreView>("history/restore", {
          root,
          path: file.path,
          version,
        });

        const restored = result.kind === "restored";
        await refresh();

        update({
          history: await load(root, file.path),
          asking: undefined,
          outcome: { kind: restored ? "restored" : "unchanged", version, changes: result.changes },
        });

        notify(
          restored
            ? `Restored v${version} of ${file.path} locally. Review it, then press Push.`
            : `${file.path} already matches v${version}.`,
        );
      } catch (error) {
        update({ asking: undefined, outcome: { kind: "refused", message: errorText(error) } });
        notify("Restore refused; see History.", true);
      }
    });
  }

  async function open(checkout: ICheckoutView, file: IFileView) {
    await busy(`Loading history of ${file.path}...`, async () => {
      pane = { root: checkout.root, file, history: await load(checkout.root, file.path) };
      draw();
      reveal(byId("history-section"));
      notify(`History of ${file.path}. Key names only, never values.`);
    });
  }

  // A refresh can change the file's status, which decides whether restore is offered.
  function track(repos: IRepoView[]) {
    const open = pane;
    if (!open) return;

    const file = repos
      .flatMap((repo) => repo.checkouts)
      .find((checkout) => checkout.root === open.root)
      ?.files.find((item) => item.path === open.file.path);

    if (file) update({ file });
  }

  return { open, track };
}
```


### apps/cli/src/ui/page/history.ts:19 :: load

DONE

Ordered statements:

```ts
call<IHistoryView>(`history?${new URLSearchParams({ root, path }).toString()}`)
```


### apps/cli/src/ui/page/history.ts:22 :: draw

DONE

Ordered statements:

```ts
{
    byId("history-section").hidden = !pane;
    byId("history").replaceChildren(...(pane ? [historyPane(pane, actions)] : []));
  }
```


### apps/cli/src/ui/page/history.ts:27 :: update

DONE

Ordered statements:

```ts
{
    if (pane) pane = { ...pane, ...change };
    draw();
  }
```


### apps/cli/src/ui/page/history.ts:33 :: callback@33

DONE

Ordered statements:

```ts
update({ asking: version, outcome: undefined })
```


### apps/cli/src/ui/page/history.ts:34 :: callback@34

DONE

Ordered statements:

```ts
update({ asking: undefined })
```


### apps/cli/src/ui/page/history.ts:35 :: callback@35

DONE

Ordered statements:

```ts
void restore(version)
```


### apps/cli/src/ui/page/history.ts:36 :: callback@36

DONE

Ordered statements:

```ts
{
      pane = undefined;
      draw();
    }
```


### apps/cli/src/ui/page/history.ts:42 :: restore

DONE

Ordered statements:

```ts
{
    if (!pane) return;
    const { root, file } = pane;

    await busy(`Restoring v${version} of ${file.path}...`, async () => {
      try {
        const result = await call<IRestoreView>("history/restore", {
          root,
          path: file.path,
          version,
        });

        const restored = result.kind === "restored";
        await refresh();

        update({
          history: await load(root, file.path),
          asking: undefined,
          outcome: { kind: restored ? "restored" : "unchanged", version, changes: result.changes },
        });

        notify(
          restored
            ? `Restored v${version} of ${file.path} locally. Review it, then press Push.`
            : `${file.path} already matches v${version}.`,
        );
      } catch (error) {
        update({ asking: undefined, outcome: { kind: "refused", message: errorText(error) } });
        notify("Restore refused; see History.", true);
      }
    });
  }
```


### apps/cli/src/ui/page/history.ts:46 :: callback@46

DONE

Ordered statements:

```ts
{
      try {
        const result = await call<IRestoreView>("history/restore", {
          root,
          path: file.path,
          version,
        });

        const restored = result.kind === "restored";
        await refresh();

        update({
          history: await load(root, file.path),
          asking: undefined,
          outcome: { kind: restored ? "restored" : "unchanged", version, changes: result.changes },
        });

        notify(
          restored
            ? `Restored v${version} of ${file.path} locally. Review it, then press Push.`
            : `${file.path} already matches v${version}.`,
        );
      } catch (error) {
        update({ asking: undefined, outcome: { kind: "refused", message: errorText(error) } });
        notify("Restore refused; see History.", true);
      }
    }
```


### apps/cli/src/ui/page/history.ts:75 :: open

DONE

Ordered statements:

```ts
{
    await busy(`Loading history of ${file.path}...`, async () => {
      pane = { root: checkout.root, file, history: await load(checkout.root, file.path) };
      draw();
      reveal(byId("history-section"));
      notify(`History of ${file.path}. Key names only, never values.`);
    });
  }
```


### apps/cli/src/ui/page/history.ts:76 :: callback@76

DONE

Ordered statements:

```ts
{
      pane = { root: checkout.root, file, history: await load(checkout.root, file.path) };
      draw();
      reveal(byId("history-section"));
      notify(`History of ${file.path}. Key names only, never values.`);
    }
```


### apps/cli/src/ui/page/history.ts:85 :: track

DONE

Ordered statements:

```ts
{
    const open = pane;
    if (!open) return;

    const file = repos
      .flatMap((repo) => repo.checkouts)
      .find((checkout) => checkout.root === open.root)
      ?.files.find((item) => item.path === open.file.path);

    if (file) update({ file });
  }
```


### apps/cli/src/ui/page/history.ts:90 :: callback@90

DONE

Ordered statements:

```ts
repo.checkouts
```


### apps/cli/src/ui/page/history.ts:91 :: callback@91

DONE

Ordered statements:

```ts
checkout.root === open.root
```


### apps/cli/src/ui/page/history.ts:92 :: callback@92

DONE

Ordered statements:

```ts
item.path === open.file.path
```


### apps/cli/src/ui/page/main.ts:24 :: refresh

DONE

Ordered statements:

```ts
{
  const status = await call<TDashboardStatus>("status");

  if (status.kind === "not-configured") {
    notify("This device isn't set up. Run envden setup or envden join in a terminal.", true);

    return false;
  }

  byId("device").textContent = status.overview.deviceName;
  renderOverview(byId("overview"), status.overview, status.conflicts.length);
  renderConflicts(byId("conflicts"), status.conflicts, resolve);
  renderRepos(byId("repos"), status.repos, { showConflict, history: history.open });
  history.track(status.repos);

  await call<IDeviceView[]>("devices").then(
    (devices) => renderDevices(byId("devices"), devices, rename),
    (error: unknown) => {
      byId("devices").textContent = errorText(error);
    },
  );

  return true;
}
```


### apps/cli/src/ui/page/main.ts:40 :: callback@40

DONE

Ordered statements:

```ts
renderDevices(byId("devices"), devices, rename)
```


### apps/cli/src/ui/page/main.ts:41 :: callback@41

DONE

Ordered statements:

```ts
{
      byId("devices").textContent = errorText(error);
    }
```


### apps/cli/src/ui/page/main.ts:49 :: showConflict

DONE

Ordered statements:

```ts
{
  const panes = byId("conflicts").querySelectorAll<HTMLElement>("[data-conflict]");
  const pane = [...panes].find((item) => item.dataset.conflict === id);

  if (pane) reveal(pane);
}
```


### apps/cli/src/ui/page/main.ts:51 :: callback@51

DONE

Ordered statements:

```ts
item.dataset.conflict === id
```


### apps/cli/src/ui/page/main.ts:56 :: sync

DONE

Ordered statements:

```ts
{
  return busy(
    kind === "pull" ? "Pulling from the server..." : "Pushing to the server...",
    async () => {
      const result = await call<ISyncResult>(kind, {});
      await refresh();

      notify(
        [syncSummary(kind, result.changed, result.conflicts), ...(result.reports ?? [])].join(" "),
        result.conflicts > 0,
      );
    },
  );
}
```


### apps/cli/src/ui/page/main.ts:59 :: callback@59

DONE

Ordered statements:

```ts
{
      const result = await call<ISyncResult>(kind, {});
      await refresh();

      notify(
        [syncSummary(kind, result.changed, result.conflicts), ...(result.reports ?? [])].join(" "),
        result.conflicts > 0,
      );
    }
```


### apps/cli/src/ui/page/main.ts:71 :: resolve

DONE

Ordered statements:

```ts
{
  const side = choice === "keep-mine" ? "your version" : "the server's version";
  if (!confirm(`Use ${side} of ${conflict.path}? The other side is backed up.`)) return;

  void busy("Resolving...", async () => {
    await call("resolve", { id: conflict.id, choice });
    await refresh();
    notify(`Resolved ${conflict.path}. Push to send it to your other devices.`);
  });
}
```


### apps/cli/src/ui/page/main.ts:75 :: callback@75

DONE

Ordered statements:

```ts
{
    await call("resolve", { id: conflict.id, choice });
    await refresh();
    notify(`Resolved ${conflict.path}. Push to send it to your other devices.`);
  }
```


### apps/cli/src/ui/page/main.ts:82 :: ready

DONE

Ordered statements:

```ts
{
  notify("Ready. Nothing syncs until you press Pull or Push.");
}
```


### apps/cli/src/ui/page/main.ts:88 :: callback@88

DONE

Ordered statements:

```ts
void busy("Refreshing...", async () => {
      if (await refresh()) ready();
    })
```


### apps/cli/src/ui/page/main.ts:89 :: callback@89

DONE

Ordered statements:

```ts
{
      if (await refresh()) ready();
    }
```


### apps/cli/src/ui/page/main.ts:94 :: callback@94

DONE

Ordered statements:

```ts
void sync("pull")
```


### apps/cli/src/ui/page/main.ts:96 :: callback@96

DONE

Ordered statements:

```ts
void sync("push")
```


### apps/cli/src/ui/page/main.ts:99 :: callback@99

DONE

Ordered statements:

```ts
{
    if (await refresh()) ready();
  }
```


### apps/cli/src/ui/page/notice.ts:3 :: notify

DONE

Ordered statements:

```ts
{
  const notice = byId("notice");
  notice.textContent = message;
  notice.dataset.error = String(error);
}
```


### apps/cli/src/ui/page/notice.ts:9 :: errorText

DONE

Ordered statements:

```ts
{
  return error instanceof Error ? error.message : "Request failed";
}
```


### apps/cli/src/ui/page/notice.ts:14 :: busy

DONE

Ordered statements:

```ts
{
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];

  for (const button of buttons) button.disabled = true;
  byId("progress").hidden = false;
  notify(message);

  try {
    await action();
  } catch (error) {
    notify(errorText(error), true);
  } finally {
    for (const button of buttons) button.disabled = false;
    byId("progress").hidden = true;
  }
}
```


### apps/cli/src/ui/page/rename.ts:6 :: createRename

DONE

Ordered statements:

```ts
{
  return async function rename(name: string): Promise<string | undefined> {
    let failure: string | undefined;

    await busy("Renaming this device...", async () => {
      try {
        const result = await call<{ kind: "renamed" | "unchanged" }>("devices/rename", { name });
        await refresh();

        notify(
          result.kind === "renamed"
            ? `This device is now ${name}.`
            : "This device already has that name.",
        );
      } catch (error) {
        failure = errorText(error);
        notify("Rename failed; see Devices.", true);
      }
    });

    return failure;
  };
}
```


### apps/cli/src/ui/page/rename.ts:7 :: rename

DONE

Ordered statements:

```ts
{
    let failure: string | undefined;

    await busy("Renaming this device...", async () => {
      try {
        const result = await call<{ kind: "renamed" | "unchanged" }>("devices/rename", { name });
        await refresh();

        notify(
          result.kind === "renamed"
            ? `This device is now ${name}.`
            : "This device already has that name.",
        );
      } catch (error) {
        failure = errorText(error);
        notify("Rename failed; see Devices.", true);
      }
    });

    return failure;
  }
```


### apps/cli/src/ui/page/rename.ts:10 :: callback@10

DONE

Ordered statements:

```ts
{
      try {
        const result = await call<{ kind: "renamed" | "unchanged" }>("devices/rename", { name });
        await refresh();

        notify(
          result.kind === "renamed"
            ? `This device is now ${name}.`
            : "This device already has that name.",
        );
      } catch (error) {
        failure = errorText(error);
        notify("Rename failed; see Devices.", true);
      }
    }
```


### apps/cli/src/ui/page/render/chip.ts:19 :: chip

DONE

Ordered statements:

```ts
{
  return el("span", {
    className: "chip",
    text: value.replaceAll("-", " "),
    data: { tone: tones[value] },
  });
}
```


### apps/cli/src/ui/page/render/chip.ts:27 :: quiet

DONE

Ordered statements:

```ts
{
  return status === "in-sync" || status === "local-only";
}
```


### apps/cli/src/ui/page/render/conflicts.ts:7 :: renderConflicts

DONE

Ordered statements:

```ts
{
  if (!conflicts.length) {
    target.replaceChildren(el("p", { className: "empty", text: "No conflicts." }));

    return;
  }

  target.replaceChildren(
    ...conflicts.map((conflict) => {
      const pane = windowPane(
        conflict.path,
        el("span", { className: "chip", text: "conflict", data: { tone: "alarm" } }),
        true,
        [
          ...conflict.roots.map((root) => el("span", { className: "mono muted", text: root })),
          sides(conflict),
          el("div", { className: "actions" }, [
            choiceButton(conflict, "keep-mine", resolve),
            choiceButton(conflict, "take-server", resolve),
          ]),
        ],
      );

      pane.dataset.conflict = conflict.id;

      return pane;
    }),
  );
}
```


### apps/cli/src/ui/page/render/conflicts.ts:19 :: callback@19

DONE

Ordered statements:

```ts
{
      const pane = windowPane(
        conflict.path,
        el("span", { className: "chip", text: "conflict", data: { tone: "alarm" } }),
        true,
        [
          ...conflict.roots.map((root) => el("span", { className: "mono muted", text: root })),
          sides(conflict),
          el("div", { className: "actions" }, [
            choiceButton(conflict, "keep-mine", resolve),
            choiceButton(conflict, "take-server", resolve),
          ]),
        ],
      );

      pane.dataset.conflict = conflict.id;

      return pane;
    }
```


### apps/cli/src/ui/page/render/conflicts.ts:25 :: callback@25

DONE

Ordered statements:

```ts
el("span", { className: "mono muted", text: root })
```


### apps/cli/src/ui/page/render/conflicts.ts:41 :: sides

DONE

Ordered statements:

```ts
{
  const keys = conflict.keys;

  const yours = conflict.mineDeleted
    ? ["deleted"]
    : keys.kind === "diff"
      ? [...keys.changed, ...keys.added.map((key) => `${key} (only here)`)]
      : [`not parsed (${keys.reason})`];

  const server = conflict.serverDeleted
    ? ["deleted"]
    : keys.kind === "diff"
      ? [...keys.changed, ...keys.removed.map((key) => `${key} (only there)`)]
      : [`not parsed (${keys.reason})`];

  const side = (label: string, items: string[]) =>
    el("div", {}, [
      el("p", { className: "label", text: label }),
      el(
        "div",
        { className: "keys" },
        (items.length ? items : ["no key changes"]).map((text) => el("span", { text })),
      ),
    ]);

  return el("div", { className: "sides" }, [side("Yours", yours), side("Server", server)]);
}
```


### apps/cli/src/ui/page/render/conflicts.ts:47 :: callback@47

DONE

Ordered statements:

```ts
`${key} (only here)`
```


### apps/cli/src/ui/page/render/conflicts.ts:53 :: callback@53

DONE

Ordered statements:

```ts
`${key} (only there)`
```


### apps/cli/src/ui/page/render/conflicts.ts:56 :: side

DONE

Ordered statements:

```ts
el("div", {}, [
      el("p", { className: "label", text: label }),
      el(
        "div",
        { className: "keys" },
        (items.length ? items : ["no key changes"]).map((text) => el("span", { text })),
      ),
    ])
```


### apps/cli/src/ui/page/render/conflicts.ts:62 :: callback@62

DONE

Ordered statements:

```ts
el("span", { text })
```


### apps/cli/src/ui/page/render/conflicts.ts:69 :: choiceButton

DONE

Ordered statements:

```ts
{
  const text = choice === "keep-mine" ? "Keep mine" : "Take server";
  const tone = choice === "keep-mine" ? "quiet" : "primary";

  return button(text, tone, `${text} for ${conflict.path}`, () => resolve(conflict, choice));
}
```


### apps/cli/src/ui/page/render/conflicts.ts:77 :: callback@77

DONE

Ordered statements:

```ts
resolve(conflict, choice)
```


### apps/cli/src/ui/page/render/devices/list.ts:5 :: renderDevices

DONE

Ordered statements:

```ts
{
  target.replaceChildren(
    el(
      "ul",
      { className: "cells", label: "Devices" },
      devices.map((device) =>
        el("li", { className: "cell" }, [
          el("h3", { text: device.name }),
          el("span", { className: device.current ? "accent" : "muted", text: flags(device) }),
          el("span", {
            className: "mono muted",
            text: device.clientVersion ? `v${device.clientVersion}` : "version unknown",
          }),
          ...(device.current ? [renameControl(device.name, rename)] : []),
        ]),
      ),
    ),
  );
}
```


### apps/cli/src/ui/page/render/devices/list.ts:10 :: callback@10

DONE

Ordered statements:

```ts
el("li", { className: "cell" }, [
          el("h3", { text: device.name }),
          el("span", { className: device.current ? "accent" : "muted", text: flags(device) }),
          el("span", {
            className: "mono muted",
            text: device.clientVersion ? `v${device.clientVersion}` : "version unknown",
          }),
          ...(device.current ? [renameControl(device.name, rename)] : []),
        ])
```


### apps/cli/src/ui/page/render/devices/list.ts:25 :: flags

DONE

Ordered statements:

```ts
{
  return (
    [
      device.current ? "this device" : "",
      device.unconfirmed ? "unconfirmed" : "",
      device.recoveryKeyHeld ? "holds recovery key" : "",
    ]
      .filter(Boolean)
      .join(" · ") || "member"
  );
}
```


### apps/cli/src/ui/page/render/devices/rename.ts:6 :: renameControl

DONE

Ordered statements:

```ts
{
  const control = el("div", { className: "rename" });

  const closed = () =>
    control.replaceChildren(button("Rename", "quiet", "Rename this device", open));

  const open = () => {
    const input = el("input", { className: "input", label: "New name for this device" });
    const error = el("p", { className: "field-error" });
    const save = el("button", { className: "button small primary", text: "Save" });

    input.value = current;
    input.autocomplete = "off";
    input.spellcheck = false;
    error.setAttribute("aria-live", "polite");
    save.type = "submit";

    const form = el("form", { className: "rename-form" }, [
      el("div", { className: "row" }, [
        input,
        save,
        button("Cancel", "quiet", "Cancel renaming", closed),
      ]),
      error,
    ]);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";

      void rename(input.value).then((message) => {
        if (!message) return;
        error.textContent = message;
        input.focus();
      });
    });

    control.replaceChildren(form);
    input.focus();
    input.select();
  };

  closed();

  return control;
}
```


### apps/cli/src/ui/page/render/devices/rename.ts:9 :: closed

DONE

Ordered statements:

```ts
control.replaceChildren(button("Rename", "quiet", "Rename this device", open))
```


### apps/cli/src/ui/page/render/devices/rename.ts:12 :: open

DONE

Ordered statements:

```ts
{
    const input = el("input", { className: "input", label: "New name for this device" });
    const error = el("p", { className: "field-error" });
    const save = el("button", { className: "button small primary", text: "Save" });

    input.value = current;
    input.autocomplete = "off";
    input.spellcheck = false;
    error.setAttribute("aria-live", "polite");
    save.type = "submit";

    const form = el("form", { className: "rename-form" }, [
      el("div", { className: "row" }, [
        input,
        save,
        button("Cancel", "quiet", "Cancel renaming", closed),
      ]),
      error,
    ]);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";

      void rename(input.value).then((message) => {
        if (!message) return;
        error.textContent = message;
        input.focus();
      });
    });

    control.replaceChildren(form);
    input.focus();
    input.select();
  }
```


### apps/cli/src/ui/page/render/devices/rename.ts:32 :: callback@32

DONE

Ordered statements:

```ts
{
      event.preventDefault();
      error.textContent = "";

      void rename(input.value).then((message) => {
        if (!message) return;
        error.textContent = message;
        input.focus();
      });
    }
```


### apps/cli/src/ui/page/render/devices/rename.ts:36 :: callback@36

DONE

Ordered statements:

```ts
{
        if (!message) return;
        error.textContent = message;
        input.focus();
      }
```


### apps/cli/src/ui/page/render/dom.ts:9 :: el

DONE

Ordered statements:

```ts
{
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.label) node.setAttribute("aria-label", props.label);
  Object.assign(node.dataset, props.data);
  node.append(...children);

  return node;
}
```


### apps/cli/src/ui/page/render/dom.ts:24 :: byId

DONE

Ordered statements:

```ts
{
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);

  return node;
}
```


### apps/cli/src/ui/page/render/dom.ts:31 :: table

DONE

Ordered statements:

```ts
{
  return el("table", {}, [
    el("thead", {}, [
      el(
        "tr",
        {},
        headings.map((text) => el("th", { text })),
      ),
    ]),
    el(
      "tbody",
      {},
      rows.map((cells) =>
        el(
          "tr",
          {},
          cells.map((cell) => el("td", {}, [cell])),
        ),
      ),
    ),
  ]);
}
```


### apps/cli/src/ui/page/render/dom.ts:37 :: callback@37

DONE

Ordered statements:

```ts
el("th", { text })
```


### apps/cli/src/ui/page/render/dom.ts:43 :: callback@43

DONE

Ordered statements:

```ts
el(
          "tr",
          {},
          cells.map((cell) => el("td", {}, [cell])),
        )
```


### apps/cli/src/ui/page/render/dom.ts:47 :: callback@47

DONE

Ordered statements:

```ts
el("td", {}, [cell])
```


### apps/cli/src/ui/page/render/dom.ts:54 :: button

DONE

Ordered statements:

```ts
{
  const node = el("button", {
    className: tone === "link" ? "link" : `button small ${tone}`,
    text,
    label,
  });

  node.type = "button";
  node.addEventListener("click", onClick);

  return node;
}
```


### apps/cli/src/ui/page/render/history/changes.ts:5 :: historyKeys

DONE

Ordered statements:

```ts
{
  if (changes === "unknown") return el("span", { className: "muted", text: "changes unknown" });
  if (changes === "unparsed") return el("span", { className: "muted", text: "not parsed" });

  return keyList({ kind: "diff", ...changes });
}
```


### apps/cli/src/ui/page/render/history/changes.ts:12 :: versionChanges

DONE

Ordered statements:

```ts
{
  if (version.kind === "deleted") return el("span", { className: "muted", text: "deleted" });

  if (version.kind === "lost")
    return el("span", { className: "muted", text: "lost in a server repair" });

  if (version.kind === "restored")
    return el("span", { className: "row" }, [
      el("span", { className: "muted", text: "restored by a server repair" }),
      historyKeys(version.changes),
    ]);

  return historyKeys(version.changes);
}
```


### apps/cli/src/ui/page/render/history/pane.ts:33 :: historyPane

DONE

Ordered statements:

```ts
{
  const { root, file, history } = pane;
  const current = history.checkouts.find((checkout) => checkout.root === root)?.version;
  const block = restoreBlock(file.status);

  const rows = history.versions.map((version) => [
    el("span", { className: "row" }, [
      el("span", { className: "mono", text: `v${version.version}` }),
      ...(version.version === current
        ? [el("span", { className: "chip", text: "current", data: { tone: "warm" } })]
        : []),
    ]),
    el("span", { className: "mono muted", text: when(version, history.checkedAt) }),
    el("span", { text: origin(version) }),
    versionChanges(version),
    restorable(version, current, block)
      ? button(
          "Restore as local edit",
          "quiet",
          `Restore v${version.version} of ${file.path}`,
          () => actions.ask(version.version),
        )
      : el("span"),
  ]);

  return windowPane(`${history.repoId} ${file.path}`, chip(file.status), true, [
    el("div", { className: "row" }, [
      el("span", { className: "mono muted", text: root }),
      button("Close", "link", "Close history", actions.close),
    ]),
    ...(block ? [el("p", { className: "callout", text: block })] : []),
    history.versions.length
      ? table(["Version", "Time", "Device", "Keys", ""], rows)
      : el("p", { className: "empty", text: "No retained versions." }),
    ...footnotes(history, current),
    ...(pane.asking === undefined ? [] : [confirmStrip(file, pane.asking, actions)]),
    ...(pane.outcome ? [outcomeStrip(file, pane.outcome)] : []),
  ]);
}
```


### apps/cli/src/ui/page/render/history/pane.ts:35 :: callback@35

DONE

Ordered statements:

```ts
checkout.root === root
```


### apps/cli/src/ui/page/render/history/pane.ts:38 :: callback@38

DONE

Ordered statements:

```ts
[
    el("span", { className: "row" }, [
      el("span", { className: "mono", text: `v${version.version}` }),
      ...(version.version === current
        ? [el("span", { className: "chip", text: "current", data: { tone: "warm" } })]
        : []),
    ]),
    el("span", { className: "mono muted", text: when(version, history.checkedAt) }),
    el("span", { text: origin(version) }),
    versionChanges(version),
    restorable(version, current, block)
      ? button(
          "Restore as local edit",
          "quiet",
          `Restore v${version.version} of ${file.path}`,
          () => actions.ask(version.version),
        )
      : el("span"),
  ]
```


### apps/cli/src/ui/page/render/history/pane.ts:53 :: callback@53

DONE

Ordered statements:

```ts
actions.ask(version.version)
```


### apps/cli/src/ui/page/render/history/pane.ts:73 :: restorable

DONE

Ordered statements:

```ts
{
  return (
    !block &&
    version.version !== current &&
    (version.kind === "live" || version.kind === "restored")
  );
}
```


### apps/cli/src/ui/page/render/history/pane.ts:81 :: when

DONE

Ordered statements:

```ts
{
  if (!version.time) return "unknown time";

  return `${formatDistanceStrict(new Date(version.time), now, { addSuffix: true })} · ${format(new Date(version.time), "PP p")}`;
}
```


### apps/cli/src/ui/page/render/history/pane.ts:87 :: origin

DONE

Ordered statements:

```ts
{
  return version.device ?? (version.removedDevice ? "removed device" : "unknown device");
}
```


### apps/cli/src/ui/page/render/history/pane.ts:91 :: footnotes

DONE

Ordered statements:

```ts
{
  return [
    ...(history.pruned ? ["Older versions pruned."] : []),
    ...(current === undefined && history.versions.length
      ? ["This checkout matches no retained version."]
      : []),
  ].map((text) => el("p", { className: "muted", text }));
}
```


### apps/cli/src/ui/page/render/history/pane.ts:97 :: callback@97

DONE

Ordered statements:

```ts
el("p", { className: "muted", text })
```


### apps/cli/src/ui/page/render/history/pane.ts:100 :: confirmStrip

DONE

Ordered statements:

```ts
{
  return el("div", { className: "strip", data: { tone: "warm" } }, [
    el("p", {
      text: `Restore v${version} of ${file.path} as a local edit? Your current file is backed up first, and nothing reaches the server until you Push.`,
    }),
    el("div", { className: "actions" }, [
      button(`Restore v${version}`, "primary", `Confirm restoring v${version}`, () =>
        actions.restore(version),
      ),
      button("Cancel", "quiet", "Cancel restore", actions.cancel),
    ]),
  ]);
}
```


### apps/cli/src/ui/page/render/history/pane.ts:106 :: callback@106

DONE

Ordered statements:

```ts
actions.restore(version)
```


### apps/cli/src/ui/page/render/history/pane.ts:114 :: outcomeStrip

DONE

Ordered statements:

```ts
{
  if (outcome.kind === "refused")
    return el("div", { className: "strip", data: { tone: "alarm" } }, [
      el("p", { text: outcome.message }),
    ]);

  if (outcome.kind === "unchanged")
    return el("div", { className: "strip" }, [
      el("p", { text: `${file.path} already matches v${outcome.version}.` }),
    ]);

  return el("div", { className: "strip", data: { tone: "warm" } }, [
    el("p", { text: `Restored v${outcome.version} of ${file.path} as a local edit:` }),
    historyKeys(outcome.changes),
    el("p", {
      className: "muted",
      text: "Review the keys in Repos, then press Push to publish them.",
    }),
  ]);
}
```


### apps/cli/src/ui/page/render/keys.ts:4 :: keyList

DONE

Ordered statements:

```ts
{
  if (!keys) return el("span", { className: "muted", text: "-" });

  if (keys.kind === "unparsed")
    return el("span", { className: "muted", text: `not parsed (${keys.reason})` });

  const items = [
    ...keys.added.map((key) => el("span", { className: "key-added", text: `+ ${key}` })),
    ...keys.removed.map((key) => el("span", { className: "key-removed", text: `- ${key}` })),
    ...keys.changed.map((key) => el("span", { text: `~ ${key}` })),
  ];

  if (!items.length) return el("span", { className: "muted", text: "layout only" });

  return el("span", { className: "keys" }, items);
}
```


### apps/cli/src/ui/page/render/keys.ts:11 :: callback@11

DONE

Ordered statements:

```ts
el("span", { className: "key-added", text: `+ ${key}` })
```


### apps/cli/src/ui/page/render/keys.ts:12 :: callback@12

DONE

Ordered statements:

```ts
el("span", { className: "key-removed", text: `- ${key}` })
```


### apps/cli/src/ui/page/render/keys.ts:13 :: callback@13

DONE

Ordered statements:

```ts
el("span", { text: `~ ${key}` })
```


### apps/cli/src/ui/page/render/overview.ts:8 :: renderOverview

DONE

Ordered statements:

```ts
{
  const cell = (term: string, value: Node[], attention = false) =>
    el("div", { data: { attention: String(attention) } }, [
      el("dt", { className: "label", text: term }),
      el("dd", { className: "mono" }, value),
    ]);

  const text = (value: string) => el("span", { text: value });

  target.replaceChildren(
    cell("Server", [
      el("span", {
        className: "light",
        label: overview.server.reachability,
        data: { tone: lights[overview.server.reachability] ?? "idle" },
      }),
      text(overview.server.address),
    ]),
    cell("Vault", [text(overview.vaultId)]),
    cell(
      "Unlock",
      [text(unlockText(overview.unlock, overview.checkedAt, (ms) => format(ms, "PP p")))],
      overview.unlock.kind === "locked",
    ),
    cell("Pending", [text(String(overview.pending))], overview.pending > 0),
    cell("Conflicts", [text(String(conflicts))], conflicts > 0),
  );
}
```


### apps/cli/src/ui/page/render/overview.ts:9 :: cell

DONE

Ordered statements:

```ts
el("div", { data: { attention: String(attention) } }, [
      el("dt", { className: "label", text: term }),
      el("dd", { className: "mono" }, value),
    ])
```


### apps/cli/src/ui/page/render/overview.ts:15 :: text

DONE

Ordered statements:

```ts
el("span", { text: value })
```


### apps/cli/src/ui/page/render/overview.ts:29 :: callback@29

DONE

Ordered statements:

```ts
format(ms, "PP p")
```


### apps/cli/src/ui/page/render/repos.ts:13 :: renderRepos

DONE

Ordered statements:

```ts
{
  if (!repos.length) {
    target.replaceChildren(el("p", { className: "empty", text: "No tracked env files yet." }));

    return;
  }

  target.replaceChildren(
    ...repos.map((repo) =>
      windowPane(
        repo.repoId,
        chip(repo.status),
        !quiet(repo.status),
        repo.checkouts.map((checkout) => checkoutBlock(checkout, actions)),
      ),
    ),
  );
}
```


### apps/cli/src/ui/page/render/repos.ts:21 :: callback@21

DONE

Ordered statements:

```ts
windowPane(
        repo.repoId,
        chip(repo.status),
        !quiet(repo.status),
        repo.checkouts.map((checkout) => checkoutBlock(checkout, actions)),
      )
```


### apps/cli/src/ui/page/render/repos.ts:26 :: callback@26

DONE

Ordered statements:

```ts
checkoutBlock(checkout, actions)
```


### apps/cli/src/ui/page/render/repos.ts:32 :: checkoutBlock

DONE

Ordered statements:

```ts
{
  return el("div", { className: "checkout" }, [
    el("div", { className: "row" }, [
      el("span", { className: "mono", text: checkout.root }),
      chip(checkout.approval),
    ]),
    table(
      ["File", "Placement", "Status", "Keys", ""],
      checkout.files.map((file) => [
        el("span", { className: "mono", text: file.path }),
        el("span", { className: "mono muted", text: file.mode }),
        statusCell(file, actions),
        keyList(file.keys),
        button("History", "link", `History of ${file.path}`, () => actions.history(checkout, file)),
      ]),
    ),
  ]);
}
```


### apps/cli/src/ui/page/render/repos.ts:40 :: callback@40

DONE

Ordered statements:

```ts
[
        el("span", { className: "mono", text: file.path }),
        el("span", { className: "mono muted", text: file.mode }),
        statusCell(file, actions),
        keyList(file.keys),
        button("History", "link", `History of ${file.path}`, () => actions.history(checkout, file)),
      ]
```


### apps/cli/src/ui/page/render/repos.ts:45 :: callback@45

DONE

Ordered statements:

```ts
actions.history(checkout, file)
```


### apps/cli/src/ui/page/render/repos.ts:51 :: statusCell

DONE

Ordered statements:

```ts
{
  const conflictId = file.conflictId;

  const hint = conflictId
    ? button("Show conflict", "link", `Show the conflict in ${file.path}`, () =>
        actions.showConflict(conflictId),
      )
    : file.held && el("span", { className: "muted", text: heldGuidance(file.held) });

  return el("span", { className: "row" }, [chip(file.status), ...(hint ? [hint] : [])]);
}
```


### apps/cli/src/ui/page/render/repos.ts:55 :: callback@55

DONE

Ordered statements:

```ts
actions.showConflict(conflictId)
```


### apps/cli/src/ui/page/render/reveal.ts:1 :: reveal

DONE

Ordered statements:

```ts
{
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  target.dataset.flash = "false";
  requestAnimationFrame(() => (target.dataset.flash = "true"));
}
```


### apps/cli/src/ui/page/render/reveal.ts:6 :: callback@6

DONE

Ordered statements:

```ts
(target.dataset.flash = "true")
```


### apps/cli/src/ui/page/render/window.ts:3 :: windowPane

DONE

Ordered statements:

```ts
{
  const handle = () => el("span", { className: "handle" });
  const hatch = () => el("span", { className: "hatch" });

  return el("figure", { className: "window", data: { lit: String(lit) } }, [
    el("figcaption", { className: "bar" }, [
      handle(),
      hatch(),
      el("span", { className: "title", text: title }),
      hatch(),
      badge,
      handle(),
    ]),
    el("div", { className: "pane" }, body),
  ]);
}
```


### apps/cli/src/ui/page/render/window.ts:4 :: handle

DONE

Ordered statements:

```ts
el("span", { className: "handle" })
```


### apps/cli/src/ui/page/render/window.ts:5 :: hatch

DONE

Ordered statements:

```ts
el("span", { className: "hatch" })
```


### apps/cli/src/ui/routes/api.ts:20 :: apiRoutes

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const body = (request: { json: () => Promise<unknown> }) => request.json().catch(() => undefined);

  return new Hono()
    .get("/status", async (c) => c.json(await dashboardStatus(adapters, now)))
    .get("/devices", async (c) => c.json(await listDevices(adapters, now)))
    .post("/pull", async (c) => c.json(await pull(adapters, dashboardSyncOptions(adapters, now))))
    .post("/push", async (c) => c.json(await push(adapters, dashboardSyncOptions(adapters, now))))
    .post("/resolve", async (c) => {
      const input = parseInput(
        resolveInputSchema,
        await body(c.req),
        "Choose a conflict and a side",
      );

      return c.json(await resolveConflict(adapters, { file: input.id, choice: input.choice, now }));
    })
    .post("/devices/rename", async (c) => {
      const input = parseInput(renameInputSchema, await body(c.req), "Enter a device name");

      return c.json(await renameDevice(adapters, input.name, now));
    })
    .get("/history", async (c) => {
      const input = parseInput(fileInputSchema, c.req.query(), "Choose an env file");

      const result = await fileHistory(adapters, {
        cwd: input.root,
        file: input.path,
        now,
        fetcher: adapters.fetcher,
      });

      const file = result.files[0];
      if (!file) throw new EnvdenError("NOT_FOUND", "File is not in an approved checkout");

      return c.json({ ...file, checkedAt: now() } satisfies IHistoryView);
    })
    .post("/history/restore", async (c) => {
      const input = parseInput(restoreInputSchema, await body(c.req), "Choose a version");

      const result = await restoreVersion(adapters, dashboardRestoreOptions(adapters, now, input));

      return c.json(result satisfies IRestoreView);
    });
}
```


### apps/cli/src/ui/routes/api.ts:21 :: body

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
request.json().catch(() => undefined)
```


### apps/cli/src/ui/routes/api.ts:21 :: callback@21

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
undefined
```


### apps/cli/src/ui/routes/api.ts:24 :: callback@24

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
c.json(await dashboardStatus(adapters, now))
```


### apps/cli/src/ui/routes/api.ts:25 :: callback@25

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
c.json(await listDevices(adapters, now))
```


### apps/cli/src/ui/routes/api.ts:26 :: callback@26

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
c.json(await pull(adapters, dashboardSyncOptions(adapters, now)))
```


### apps/cli/src/ui/routes/api.ts:27 :: callback@27

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
c.json(await push(adapters, dashboardSyncOptions(adapters, now)))
```


### apps/cli/src/ui/routes/api.ts:28 :: callback@28

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
      const input = parseInput(
        resolveInputSchema,
        await body(c.req),
        "Choose a conflict and a side",
      );

      return c.json(await resolveConflict(adapters, { file: input.id, choice: input.choice, now }));
    }
```


### apps/cli/src/ui/routes/api.ts:37 :: callback@37

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
      const input = parseInput(renameInputSchema, await body(c.req), "Enter a device name");

      return c.json(await renameDevice(adapters, input.name, now));
    }
```


### apps/cli/src/ui/routes/api.ts:42 :: callback@42

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
      const input = parseInput(fileInputSchema, c.req.query(), "Choose an env file");

      const result = await fileHistory(adapters, {
        cwd: input.root,
        file: input.path,
        now,
        fetcher: adapters.fetcher,
      });

      const file = result.files[0];
      if (!file) throw new EnvdenError("NOT_FOUND", "File is not in an approved checkout");

      return c.json({ ...file, checkedAt: now() } satisfies IHistoryView);
    }
```


### apps/cli/src/ui/routes/api.ts:57 :: callback@57

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
      const input = parseInput(restoreInputSchema, await body(c.req), "Choose a version");

      const result = await restoreVersion(adapters, dashboardRestoreOptions(adapters, now, input));

      return c.json(result satisfies IRestoreView);
    }
```


### apps/cli/src/ui/routes/inputs/parse.ts:4 :: parseInput

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const input = schema.safeParse(value);
  if (!input.success) throw new EnvdenError("INVALID_INPUT", message);

  return input.data as z.infer<T>;
}
```


### apps/cli/src/ui/routes/page.ts:4 :: pageRoutes

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return new Hono().get("*", (c) => {
    const asset = assets.get(c.req.path);
    if (!asset) return c.notFound();

    return c.body(asset.body, 200, { "Content-Type": asset.type });
  });
}
```


### apps/cli/src/ui/routes/page.ts:5 :: callback@5

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
    const asset = assets.get(c.req.path);
    if (!asset) return c.notFound();

    return c.body(asset.body, 200, { "Content-Type": asset.type });
  }
```


### apps/cli/src/ui/server/app.ts:19 :: createDashboardApp

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const { adapters, now, token, port, assets } = dashboard;

  return new Hono()
    .onError((error, c) => {
      const body = errorBody(error);

      return c.json(body, errorStatus(body.error));
    })
    .use("*", async (c, next) => {
      await next();

      for (const [name, value] of Object.entries(securityHeaders)) c.res.headers.set(name, value);
    })
    .use("*", async (c, next) => {
      if (!allowedHost(c.req.header("Host"), port))
        return c.json({ error: "INVALID_INPUT", message: "Unexpected host" }, 421);

      await next();
    })
    .use("/api/*", async (c, next) => {
      if (!tokenMatches(c.req.header("Authorization"), token))
        return c.json({ error: "UNAUTHORIZED", message: "Open the link envden ui printed" }, 401);

      if (c.req.method !== "GET" && !sameOrigin(c.req.header("Origin"), c.req.header("Host")))
        return c.json({ error: "UNAUTHORIZED", message: "Cross-origin request refused" }, 403);

      await next();
    })
    .route("/api", apiRoutes(adapters, now))
    .route("/", pageRoutes(assets));
}
```


### apps/cli/src/ui/server/app.ts:23 :: callback@23

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
      const body = errorBody(error);

      return c.json(body, errorStatus(body.error));
    }
```


### apps/cli/src/ui/server/app.ts:28 :: callback@28

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
      await next();

      for (const [name, value] of Object.entries(securityHeaders)) c.res.headers.set(name, value);
    }
```


### apps/cli/src/ui/server/app.ts:33 :: callback@33

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
      if (!allowedHost(c.req.header("Host"), port))
        return c.json({ error: "INVALID_INPUT", message: "Unexpected host" }, 421);

      await next();
    }
```


### apps/cli/src/ui/server/app.ts:39 :: callback@39

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
      if (!tokenMatches(c.req.header("Authorization"), token))
        return c.json({ error: "UNAUTHORIZED", message: "Open the link envden ui printed" }, 401);

      if (c.req.method !== "GET" && !sameOrigin(c.req.header("Origin"), c.req.header("Host")))
        return c.json({ error: "UNAUTHORIZED", message: "Cross-origin request refused" }, 403);

      await next();
    }
```


### apps/cli/src/ui/server/assets.ts:15 :: pageAssets

PENDING

Ordered statements:

```ts
{
  const files = bundle.files ? compiledFiles(bundle.files) : await sourceFiles(bundle.index);
  const assets = new Map<string, IPageAsset>();

  for (const file of files) {
    const route = file.type.startsWith("text/html") ? "/" : `/${basename(file.path)}`;

    assets.set(route, { body: await file.bytes(), type: file.type });
  }

  return assets;
}
```


### apps/cli/src/ui/server/assets.ts:29 :: compiledFiles

PENDING

Ordered statements:

```ts
{
  return files.map((file) => ({
    path: file.path,
    type: file.headers["content-type"],
    bytes: () => Bun.file(file.path).arrayBuffer(),
  }));
}
```


### apps/cli/src/ui/server/assets.ts:30 :: callback@30

PENDING

Ordered statements:

```ts
({
    path: file.path,
    type: file.headers["content-type"],
    bytes: () => Bun.file(file.path).arrayBuffer(),
  })
```


### apps/cli/src/ui/server/assets.ts:33 :: callback@33

PENDING

Ordered statements:

```ts
Bun.file(file.path).arrayBuffer()
```


### apps/cli/src/ui/server/assets.ts:37 :: sourceFiles

PENDING

Ordered statements:

```ts
{
  const result = await Bun.build({ entrypoints: [index] });

  return result.outputs.map((output) => ({
    path: output.path,
    type: output.type,
    bytes: () => output.arrayBuffer(),
  }));
}
```


### apps/cli/src/ui/server/assets.ts:40 :: callback@40

PENDING

Ordered statements:

```ts
({
    path: output.path,
    type: output.type,
    bytes: () => output.arrayBuffer(),
  })
```


### apps/cli/src/ui/server/assets.ts:43 :: callback@43

PENDING

Ordered statements:

```ts
output.arrayBuffer()
```


### apps/cli/src/ui/server/errors.ts:9 :: errorStatus

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (badRequest.includes(code)) return 400;
  if (refused.includes(code)) return 403;
  if (code === "NOT_FOUND") return 404;
  if (outdated.includes(code)) return 426;
  if (code === "NOT_IMPLEMENTED") return 501;
  if (upstream.includes(code)) return 502;

  return code === "INTERNAL" ? 500 : 409;
}
```


### apps/cli/src/ui/server/errors.ts:21 :: errorBody

PENDING

Ordered statements:

```ts
{
  if (error instanceof EnvdenError) return { error: error.code, message: error.message };

  return { error: "INTERNAL", message: "envden ui hit an internal error" };
}
```


### apps/cli/src/ui/server/host.ts:2 :: allowedHost

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}
```


### apps/cli/src/ui/server/host.ts:6 :: sameOrigin

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return !!origin && !!host && origin === `http://${host}`;
}
```


### apps/cli/src/ui/server/token.ts:3 :: newToken

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return Buffer.from(p.randomBytes(32)).toString("base64url");
}
```


### apps/cli/src/ui/server/token.ts:7 :: tokenMatches

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const encoder = new TextEncoder();

  return p.equal(encoder.encode(presented), encoder.encode(token));
}
```


### apps/cli/src/ui/start.ts:17 :: runDashboard

PENDING

Ordered statements:

```ts
{
  if (!options.interactive)
    throw new EnvdenError("INVALID_INPUT", "envden ui needs an interactive terminal");

  if (options.port !== undefined && !validPort(options.port))
    throw new EnvdenError("INVALID_INPUT", "Port must be 1-65535");

  const token = newToken();
  const assets = await pageAssets(page);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    fetch: (request) => app.fetch(request),
  });

  const port = server.port ?? options.port ?? 0;
  const app = createDashboardApp({ adapters, now: options.now, token, port, assets });
  const url = `http://127.0.0.1:${port}/#${token}`;

  try {
    options.report(`envden ui: ${url}`);
    options.report("Press Ctrl-C to stop.");

    if (options.open && !(await options.open(url)))
      options.report("Could not open a browser; open the link above.");

    await options.stopped;
  } finally {
    await server.stop(true);
  }

  return { kind: "stopped" as const };
}
```


### apps/cli/src/ui/start.ts:30 :: callback@30

PENDING

Ordered statements:

```ts
app.fetch(request)
```


### apps/cli/src/ui/start.ts:52 :: validPort

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return Number.isInteger(port) && port > 0 && port < 65536;
}
```


### apps/cli/src/ui/view/conflicts.ts:7 :: conflictViews

PENDING

Ordered statements:

```ts
{
  const views: IConflictView[] = [];

  for (const record of await conflictRecords(home)) {
    const mine = record.mineDeleted ? undefined : await readBytes(record.mine);
    const server = record.deleted ? undefined : await readBytes(record.server);

    views.push({
      id: record.file,
      path: record.path,
      roots: record.targets.map((target) => target.root),
      keys: keyChanges(diffEnvKeys(server ?? new Uint8Array(), mine ?? new Uint8Array())),
      serverDeleted: record.deleted,
      mineDeleted: record.mineDeleted,
    });
  }

  return views;
}
```


### apps/cli/src/ui/view/conflicts.ts:17 :: callback@17

PENDING

Ordered statements:

```ts
target.root
```


### apps/cli/src/ui/view/file-status.ts:23 :: fileStatus

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (facts.localOnly) return "local-only";
  if (facts.conflict) return "conflict";
  if (facts.placement === "detached") return "detached";
  if (facts.heldBack) return "held-back";
  if (facts.placement === "missing") return "missing";
  if (facts.changed) return "local-changes";

  return facts.remote ? "remote-changes" : "in-sync";
}
```


### apps/cli/src/ui/view/file-status.ts:34 :: pendingCount

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  return statuses.filter((status) => status !== "in-sync" && status !== "local-only").length;
}
```


### apps/cli/src/ui/view/file-status.ts:35 :: callback@35

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
status !== "in-sync" && status !== "local-only"
```


### apps/cli/src/ui/view/file-status.ts:38 :: mostUrgent

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return urgency.find((status) => statuses.includes(status)) ?? "in-sync";
}
```


### apps/cli/src/ui/view/file-status.ts:39 :: callback@39

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
statuses.includes(status)
```


### apps/cli/src/ui/view/guidance/held.ts:14 :: heldGuidance

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  return guidance[held];
}
```


### apps/cli/src/ui/view/guidance/restore.ts:4 :: restoreBlock

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (status === "local-only") return "Local-only files have no history on the server.";
  if (status === "conflict") return "Choose a side in Conflicts before restoring.";
  if (status === "detached") return "This file is detached; press Pull to reconcile it first.";

  return undefined;
}
```


### apps/cli/src/ui/view/key-changes.ts:4 :: keyChanges

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (result.kind === "diff")
    return { kind: "diff", added: result.added, removed: result.removed, changed: result.changed };

  return { kind: "unparsed", reason: result.reason, ...(result.key ? { key: result.key } : {}) };
}
```


### apps/cli/src/ui/view/repos.ts:11 :: groupRepos

PENDING

Ordered statements:

```ts
{
  const repos = new Map<string, IRepoView>();

  for (const row of rows) {
    const repo = repos.get(row.repoId) ?? {
      repoId: row.repoId,
      status: row.file.status,
      checkouts: [],
    };

    repos.set(row.repoId, repo);

    let checkout = repo.checkouts.find((item) => item.root === row.root);

    if (!checkout) {
      checkout = { root: row.root, approval: row.approval, files: [] };
      repo.checkouts.push(checkout);
    }

    checkout.files.push(row.file);
    repo.status = mostUrgent([repo.status, row.file.status]);
  }

  return [...repos.values()].sort((a, b) => a.repoId.localeCompare(b.repoId));
}
```


### apps/cli/src/ui/view/repos.ts:23 :: callback@23

PENDING

Ordered statements:

```ts
item.root === row.root
```


### apps/cli/src/ui/view/repos.ts:34 :: callback@34

PENDING

Ordered statements:

```ts
a.repoId.localeCompare(b.repoId)
```


### apps/cli/src/ui/view/status.ts:28 :: dashboardStatus

PENDING

Ordered statements:

```ts
{
  const before = await loadState(adapters.home);
  if (!before?.server || !before.vaultId) return { kind: "not-configured" };

  const diffs = await diff(adapters, { now, fetcher: adapters.fetcher, all: true });
  const local = await localStatus(adapters);
  const state = await loadState(adapters.home);

  if (!("vaultId" in local) || !state?.server || !state.vaultId) return { kind: "not-configured" };

  const heldBack = await heldBackFiles(adapters);
  const remote = new Set((await readRemoteNotice(adapters.home))?.repos ?? []);
  const approvals = await checkoutApprovals(adapters, state);
  const conflicts = await conflictViews(adapters.home);
  const probe = await probeUnlock(adapters, now);
  const checkedAt = now();

  const facts = { diffs, heldBack, conflicts, remote };

  const rows = local.links.map((link) => {
    const repoId = checkoutRepo(state, link.root);

    return {
      repoId: repoId ?? "unapproved",
      root: link.root,
      approval: approvals.get(link.root) ?? "needs-approval",
      file: fileView(link, repoId, facts),
    };
  });

  return {
    kind: "configured",
    overview: {
      vaultId: state.vaultId.slice(0, 8),
      server: { address: state.server.address, reachability: local.server },
      deviceName: state.deviceName,
      unlock: deriveUnlock(state.session?.unlockedUntil, probe, checkedAt),
      checkedAt,
      pending: pendingCount(rows.map((row) => row.file.status)),
    },
    repos: groupRepos(rows),
    conflicts,
  };
}
```


### apps/cli/src/ui/view/status.ts:50 :: callback@50

PENDING

Ordered statements:

```ts
{
    const repoId = checkoutRepo(state, link.root);

    return {
      repoId: repoId ?? "unapproved",
      root: link.root,
      approval: approvals.get(link.root) ?? "needs-approval",
      file: fileView(link, repoId, facts),
    };
  }
```


### apps/cli/src/ui/view/status.ts:69 :: callback@69

PENDING

Ordered statements:

```ts
row.file.status
```


### apps/cli/src/ui/view/status.ts:76 :: fileView

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const changes = facts.diffs.find((item) => item.root === link.root && item.path === link.path);
  const held = facts.heldBack.find((item) => item.path === join(link.root, link.path));
  const conflict = link.conflict ? conflictOf(facts.conflicts, link) : undefined;

  return {
    path: link.path,
    mode: link.mode,
    status: fileStatus({
      localOnly: link.localOnly,
      placement: link.status,
      conflict: link.conflict,
      heldBack: !!held,
      changed: !!changes?.differs,
      remote: !!repoId && facts.remote.has(repoId),
    }),
    ...(held ? { held: held.kind } : {}),
    ...(conflict ? { conflictId: conflict.id } : {}),
    ...(changes?.differs ? { keys: keyChanges(changes) } : {}),
  };
}
```


### apps/cli/src/ui/view/status.ts:77 :: callback@77

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
item.root === link.root && item.path === link.path
```


### apps/cli/src/ui/view/status.ts:78 :: callback@78

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
item.path === join(link.root, link.path)
```


### apps/cli/src/ui/view/status.ts:98 :: conflictOf

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  return conflicts.find((item) => item.path === link.path && item.roots.includes(link.root));
}
```


### apps/cli/src/ui/view/status.ts:99 :: callback@99

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
item.path === link.path && item.roots.includes(link.root)
```


### apps/cli/src/ui/view/status.ts:102 :: checkoutApprovals

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
{
  const approvals = new Map<string, TApproval>();

  for (const root of new Set(state.links.map((link) => link.root))) {
    const checkout = await adapters.repo.checkoutAt(root);
    const approval = checkout ? checkoutApproval(state, checkout) : "unavailable";

    approvals.set(root, approval === "ask" ? "needs-approval" : approval);
  }

  return approvals;
}
```


### apps/cli/src/ui/view/status.ts:105 :: callback@105

DONE: ordered comparison and regression evidence recorded above or inherited from sweep-1.

Ordered statements:

```ts
link.root
```


### apps/cli/src/ui/view/summary.ts:3 :: syncSummary

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  const noun = plural.select(conflicts) === "one" ? "conflict" : "conflicts";

  return `${kind === "pull" ? "Pulled" : "Pushed"}: ${changed} changed, ${conflicts} ${noun}.`;
}
```


### apps/cli/src/ui/view/unlock/probe.ts:6 :: probeUnlock

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  try {
    return { kind: "unlocked", period: (await getUnlockPeriod(adapters, now)).period };
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "LOCKED") return { kind: "locked" };

    return { kind: "unreachable" };
  }
}
```


### apps/cli/src/ui/view/unlock/state.ts:9 :: deriveUnlock

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (probe.kind === "locked") return { kind: "locked" };

  if (probe.kind === "unlocked") {
    if (probe.period === null) return { kind: "never" };

    return typeof recorded === "number" && recorded > now
      ? { kind: "until", until: recorded }
      : { kind: "unrecorded" };
  }

  if (recorded === null) return { kind: "never" };
  if (recorded === undefined) return { kind: "unknown" };

  return recorded > now ? { kind: "until", until: recorded } : { kind: "locked" };
}
```


### apps/cli/src/ui/view/unlock/text.ts:11 :: unlockText

DONE: inherited ordered comparison from sweep-1 or the explicit follow-up comparisons above.

Ordered statements:

```ts
{
  if (unlock.kind !== "until") return fixed[unlock.kind];
  if (unlock.until <= now) return fixed.locked;

  return `${date(unlock.until)} (${formatDistanceStrict(unlock.until, now, { addSuffix: true })})`;
}
```

## Latest fixes

- 1a2da199: dashboard reads request bodies only for POST resolve/rename/restore, as TS apiRoutes.body does. Red unused-body polling test then four green server tests.
- 432613d1: nested command parser errors use the existing terminal sanitizer. Red CLI subprocess regression then green.
- Complete AST inventory includes every declaration, method, named expression and arrow callback in this slice, excluding tests and state/lock. Entries without verified comparisons remain PENDING.

## Validation run selection

The redundant final-parity run was stopped to reduce CPU contention. Use parity.log and e2e.log from the original foreground pipeline. The latest native lint is latest-clippy.log, and latest-release.log is the rebuild including radix parsing. All changes were pushed through 528b8751; branch tracks origin/port/rust.

## Remaining helper normalization check

output/home-path.homePath: TS relative() resolves and lexically normalizes both arguments; Rust strip_prefix does not. CLI callers usually provide canonical roots, but direct dotted/relative path inputs still require a failing regression and shared normalization fix. Do not claim full arbitrary-input parity for this helper.

## Home and state completion handoff

- 60817997: Unix nonempty HOME then effective UID passwd entry; Windows nonempty USERPROFILE then HOMEDRIVE+HOMEPATH then system profile. Pure tests inject both platforms; Bun on this Unix machine confirmed empty HOME falls back. No unsafe code and no environment mutation.
- 5eff8865: resolve and lexically normalize relative ENVDEN_HOME before deriving config/store/state paths. Failing missing-ancestor regression then green.
- 5df5c089: remove Windows-only unused mut in owned diagnostics probe.
- Existing self-update HOME ?? USERPROFILE guard remains because frozen TS explicitly uses that expression, not os.homedir().
- 8c82ea85 pins exact nested parser ESC bytes; 1253d965 restores raw stderr output and records the TS terminal-injection bug in PARITY-NOTES.md. 432613d1's stripping change was incorrect and superseded.
- 9379f52c absorbed intermediate state/files.rs in a shared-index race. Preserved history.
- 5b4a76db: state optionalRead uses UTF8 replacement and read-after-stat ENOENT handling; directories and temporary files invoke core restrictAccess on every platform before registration/write. Private regression helpers and tests are committed in state/files/tests.rs.
- 23737d48: loadState restores update-cache latest before placement journal and never persists latest in device.json.
- State tests 17/17 green: green-state.log. Native Clippy green: settled-clippy.log. Windows check via local Zig wrapper green with no CLI warnings: settled-windows.log; remaining unused File import is in rust/server/src/identity/persist.rs outside this slice.
- 24/24 parity and e2e passed before the final home/state changes; see parity.log and e2e.log. The onboarding agent owns the newest full-workspace/release rerun in /tmp/onb-final-*.log.
- State slice settled and committed through 23737d48. Push left to the coordinating user/onboarding agent. No owned dirty or untracked files remain.
- Still unresolved: atomicWrite's cleanup-failure propagation; full tagged reviver/header-cause parity; requireConfigured malformed falsy fields/custom message behavior; the previously recorded locale, process env and UI shutdown gaps.
