import { deriveContentAction } from "./decision.ts";
import { same } from "../files.ts";

type TBytes = Uint8Array | undefined;

export function deriveFileContent(
  store: TBytes,
  copies: { bytes: TBytes; base: TBytes; tracked: boolean; detached: boolean }[],
) {
  const edits: TBytes[] = [];

  const add = (bytes: TBytes) => {
    if (!edits.some((item) => same(item, bytes))) edits.push(bytes);
  };

  for (const copy of copies) {
    if (same(copy.bytes, store) || same(copy.bytes, copy.base)) continue;
    if (!copy.tracked && copy.bytes === undefined) continue;
    if (copy.detached) add(copy.bytes);
    if (!same(store, copy.base)) add(store);
    add(copy.bytes);
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
  },
) {
  const local = deriveFileContent(input.store, input.copies);
  const mine = local.kind === "conflict" ? local.mine : local.bytes;

  const action = deriveContentAction({
    ...input,
    linked: input.tracked || input.store !== undefined,
    useStore: true,
    mine,
    server: input.published ? input.server : mine,
  });

  return { local, mine, action };
}
