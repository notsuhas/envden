import { values, caseValue, type remotes } from "./matrix-cases.ts";

type TRemote = (typeof remotes)[number];

type TValue = string | undefined;

function remoteContent(path: string, remote: TRemote) {
  if (["deleted", "applied", "unpublished"].includes(remote)) return undefined;
  if (remote === "changed") return caseValue(path, "TOKEN=R\n");
  if (remote === "merge") return caseValue(path, "TOKEN=local-test-value\nOTHER=R\n");

  return caseValue(path, values[0]);
}

function localContent(store: TValue, copies: TValue[], base: TValue, deleted: boolean) {
  const candidates = [
    ...new Set(
      copies.filter(
        (bytes) =>
          bytes !== undefined &&
          bytes !== store &&
          ((store === undefined && !deleted) || bytes !== base),
      ),
    ),
  ];

  const unsafe = candidates.length > 0 && (base === undefined || base !== store);
  const conflict = unsafe || candidates.length > 1;
  if (!conflict) return { conflict, mine: candidates[0] ?? store, theirs: undefined };
  if (unsafe && base !== undefined) return { conflict, mine: store, theirs: candidates[0] };

  return { conflict, mine: candidates[0], theirs: unsafe ? store : candidates[1] };
}

function finalContent(mine: TValue, server: TValue, previous: TValue, unpublished: boolean) {
  if (unpublished || server === previous) return mine;
  if (mine === previous || mine === server) return server;

  return mine;
}

export function expectedCase(
  path: string,
  row: TValue[],
  remote: TRemote,
  modes: ("link" | "copy")[],
) {
  const original = caseValue(path, values[0]);
  const server = remoteContent(path, remote);
  const previous = ["applied", "unpublished"].includes(remote) ? undefined : original;
  const store = row[0] ?? server;

  const local = localContent(
    store,
    row.slice(1),
    remote === "applied" ? undefined : original,
    remote === "deleted" || remote === "applied",
  );

  const theirs = server === previous && local.conflict ? local.theirs : server;
  const remoteConflict = local.mine !== server && local.mine !== previous && server !== previous;
  const conflict = local.conflict || (remote !== "unpublished" && remoteConflict);

  const merged =
    !local.conflict &&
    remote === "merge" &&
    local.mine !== undefined &&
    local.mine !== original &&
    local.mine.endsWith("OTHER=base\n");

  const result = finalContent(local.mine, server, previous, remote === "unpublished");

  const finalStore = selectedStore(local.mine, store, result, conflict, merged);
  const finalConflict = conflict && !merged;

  return {
    store: finalStore,
    conflict: finalConflict,
    mine: local.mine,
    theirs,
    targets: expectedTargets(modes, row, finalStore, finalConflict),
  };
}

function selectedStore(
  mine: TValue,
  before: TValue,
  result: TValue,
  conflict: boolean,
  merged: boolean,
) {
  if (merged) return mine!.replace("OTHER=base\n", "OTHER=R\n");

  return conflict ? before : result;
}

function expectedTargets(
  modes: ("link" | "copy")[],
  row: TValue[],
  store: TValue,
  conflict: boolean,
) {
  let copy = 0;

  return modes.map((mode) => {
    if (mode === "link") return store;
    const before = row[++copy];

    return conflict ? before : store;
  });
}
