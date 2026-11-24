import { same } from "../files.ts";

type TBytes = Uint8Array | undefined;

interface IFastForward {
  action: { kind: string; next?: TBytes };
  local: { kind: string };
  mine: TBytes;
  previous: TBytes;
  server: TBytes;
  published: boolean;
  tombstone: boolean;
  detached: boolean;
  repair: boolean;
  conflicted: boolean;
}

// Auto-pull writes only when every local copy still holds what the last sync left there.
export function deriveFastForward(input: IFastForward): "pull" | "refuse" {
  const untouched = same(input.mine, input.previous) || same(input.mine, input.server);

  const clean =
    input.published &&
    !input.tombstone &&
    !input.detached &&
    !input.repair &&
    !input.conflicted &&
    input.local.kind !== "conflict" &&
    input.action.kind === "write" &&
    same(input.action.next, input.server);

  return clean && untouched ? "pull" : "refuse";
}
