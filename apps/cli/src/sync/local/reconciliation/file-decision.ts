import { deriveContentAction } from "./decision.ts";
import { deriveFileSides } from "./content/sides.ts";

type TBytes = Uint8Array | undefined;

export function deriveFileDecision(
  input: Omit<Parameters<typeof deriveContentAction>[0], "mine" | "linked" | "useStore"> & {
    store: TBytes;
    copies: Parameters<typeof deriveFileSides>[0]["copies"];
    storeBeforeRestore: TBytes;
    tracked: boolean;
    published: boolean;
    deleting?: boolean;
  },
) {
  const store = input.store ?? (input.published && !input.deleting ? input.server : undefined);

  const { local, mine, theirs } = deriveFileSides({
    storeBeforeRestore: input.storeBeforeRestore,
    recorded: input.recorded,
    previous: input.previous,
    server: !input.published
      ? { kind: "absent" }
      : input.tombstone
        ? { kind: "tombstone" }
        : { kind: "live", bytes: input.server! },
    copies: input.copies,
    pendingRemoval: !!input.deleting,
  });

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
    theirs,
    action: local.kind === "conflict" ? { kind: "conflict" as const } : action,
  };
}
