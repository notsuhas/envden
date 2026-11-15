import { same } from "../../files.ts";

type TBytes = Uint8Array | undefined;

type TServer = { kind: "absent" } | { kind: "live"; bytes: Uint8Array } | { kind: "tombstone" };

export function deriveFileSides(input: {
  storeBeforeRestore: TBytes;
  recorded: TBytes;
  previous: TBytes;
  server: TServer;
  copies: Parameters<typeof deriveFileContent>[1];
  pendingRemoval: boolean;
}) {
  const remote = input.server;
  const server = remote.kind === "live" ? remote.bytes : undefined;
  const store = input.storeBeforeRestore ?? (!input.pendingRemoval ? server : undefined);

  const edited =
    input.pendingRemoval ||
    (input.storeBeforeRestore !== undefined &&
      (!same(input.storeBeforeRestore, input.recorded ?? input.previous) ||
        !same(input.storeBeforeRestore, input.previous)));

  const local = deriveFileContent(
    store,
    input.copies.filter(
      (copy) =>
        !(same(copy.bytes, server) && (copy.base === undefined || same(store, input.previous))),
    ),
    input.pendingRemoval || remote.kind === "tombstone",
    edited,
  );

  const mine = input.pendingRemoval
    ? undefined
    : local.kind === "conflict"
      ? edited
        ? store
        : local.variants.find((bytes) => bytes !== undefined)
      : local.bytes;

  return { local, mine, theirs: remote };
}

function deriveFileContent(
  store: TBytes,
  copies: {
    bytes: TBytes;
    base: TBytes;
    tracked: boolean;
    detached: boolean;
    mode: "link" | "copy";
    historical?: boolean;
  }[],
  deleted = false,
  storeEdited = false,
) {
  const edits: TBytes[] = [];

  const add = (bytes: TBytes) => {
    if (!edits.some((item) => same(item, bytes))) edits.push(bytes);
  };

  for (const copy of copies) {
    for (const bytes of targetEdits(store, copy, deleted, storeEdited)) add(bytes);
  }

  if (edits.length > 1) return { kind: "conflict", variants: Object.freeze(edits) } as const;

  return { kind: "content", bytes: edits.length ? edits[0] : store } as const;
}

function targetEdits(
  store: TBytes,
  copy: Parameters<typeof deriveFileContent>[1][number],
  deleted: boolean,
  storeEdited: boolean,
): TBytes[] {
  if (copy.bytes === undefined || same(copy.bytes, store) || copy.historical) return [];

  if (!copy.tracked || copy.base === undefined)
    return storeEdited ? [store, copy.bytes] : [copy.bytes, store];

  if (copy.mode === "link") return same(store, copy.base) ? [copy.bytes] : [store, copy.bytes];

  return copyEdits(store, copy.bytes, copy.base, deleted, storeEdited);
}

function copyEdits(
  store: TBytes,
  bytes: Uint8Array,
  base: Uint8Array,
  deleted: boolean,
  storeEdited: boolean,
): TBytes[] {
  if (same(bytes, base)) return store === undefined && !deleted ? [store, bytes] : [];
  if (same(store, base)) return [bytes];

  return storeEdited ? [store, bytes] : [bytes, store];
}
