import { same } from "../files.ts";

type TBytes = Uint8Array | undefined;

interface IFastForward {
  action: { kind: string; next?: TBytes };
  local: { kind: string };
  copies: readonly { mode: "link" | "copy"; status: string; bytes: TBytes; base: TBytes }[];
  previous: TBytes;
  server: TBytes;
  published: boolean;
  tombstone: boolean;
  detached: boolean;
  repair: boolean;
  conflicted: boolean;
}

// Auto-pull writes only a newer live version over copies that each still hold their last-synced bytes.
export function deriveFastForward(input: IFastForward): "pull" | "refuse" {
  const newer =
    input.published &&
    !input.tombstone &&
    input.previous !== undefined &&
    !same(input.server, input.previous);

  const untouched =
    input.copies.length > 0 &&
    input.copies.every(
      (copy) =>
        (copy.mode === "copy" || copy.status === "linked") &&
        copy.bytes !== undefined &&
        same(copy.bytes, copy.base),
    );

  const clean =
    !input.detached &&
    !input.repair &&
    !input.conflicted &&
    input.local.kind !== "conflict" &&
    input.action.kind === "write" &&
    same(input.action.next, input.server);

  return newer && untouched && clean ? "pull" : "refuse";
}
