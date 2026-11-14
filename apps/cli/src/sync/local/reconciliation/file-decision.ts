import { deriveContentAction } from "./decision.ts";
import { same } from "../files.ts";

type TBytes = Uint8Array | undefined;

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
) {
  const edits: TBytes[] = [];

  const add = (bytes: TBytes) => {
    if (!edits.some((item) => same(item, bytes))) edits.push(bytes);
  };

  for (const copy of copies) {
    for (const bytes of targetEdits(store, copy, deleted)) add(bytes);
  }

  if (edits.length > 1) return { kind: "conflict", mine: edits[0], theirs: edits[1] } as const;

  return { kind: "content", bytes: edits.length ? edits[0] : store } as const;
}

export function deriveFileDecision(
  input: Omit<Parameters<typeof deriveContentAction>[0], "mine" | "linked" | "useStore"> & {
    store: TBytes;
    copies: Parameters<typeof deriveFileContent>[1];
    tracked: boolean;
    published: boolean;
    deleting?: boolean;
  },
) {
  const store = input.store ?? (input.published && !input.deleting ? input.server : undefined);

  const local = deriveFileContent(
    store,
    input.copies.filter((copy) => !(same(copy.bytes, input.server) && same(store, input.previous))),
    !!input.deleting || (input.published && !!input.tombstone),
  );

  const mine = local.kind === "conflict" ? local.mine : local.bytes;

  const action = deriveContentAction({
    ...input,
    linked: input.tracked || store !== undefined,
    useStore: true,
    mine,
    server: input.published ? input.server : mine,
  });

  return {
    local,
    mine,
    action: local.kind === "conflict" ? { kind: "conflict" as const } : action,
  };
}

function targetEdits(
  store: TBytes,
  copy: Parameters<typeof deriveFileContent>[1][number],
  deleted: boolean,
): TBytes[] {
  if (copy.bytes === undefined || same(copy.bytes, store) || copy.historical) return [];

  if (!copy.tracked || copy.base === undefined) return [copy.bytes, store];

  if (copy.mode === "link") return same(store, copy.base) ? [copy.bytes] : [store, copy.bytes];

  return copyEdits(store, copy.bytes, copy.base, deleted);
}

function copyEdits(store: TBytes, bytes: Uint8Array, base: Uint8Array, deleted: boolean): TBytes[] {
  if (same(bytes, base)) return store === undefined && !deleted ? [store, bytes] : [];
  if (same(store, base)) return [bytes];

  return [bytes, store];
}
