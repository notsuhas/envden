import type { IManifestHeader, ISigned, TEntry } from "../../protocol/index.ts";
import { equal } from "../../protocol/index.ts";
import type { IDeviceListState } from "../devices/state.ts";
import { check } from "../shared/validation.ts";

export type TAuthorization =
  | "member"
  | "join-grant"
  | "join-ticket"
  | "member-or-repair-token"
  | "move-session"
  | "move-import"
  | "repair-token";

export function operationRequirement(
  previous: IManifestHeader,
  header: IManifestHeader,
  entries: readonly ISigned<TEntry>[],
  before: IDeviceListState,
  onNewServer = false,
): TAuthorization {
  const op = header.op;
  check(requirements[op] !== undefined);
  const entry = entries[0]?.body;
  check(entries.length === ([1, 11].includes(op) ? 0 : 1));
  const epochChange = [4, 5, 6, 7].includes(op);
  const envelopeChange = [5, 7].includes(op);
  const filesChange = [1, 11].includes(op);
  check(header.epoch === previous.epoch + (epochChange ? 1 : 0));
  check(epochChange !== equal(header.keyringHash, previous.keyringHash));
  check(envelopeChange !== equal(header.envelopeHash, previous.envelopeHash));
  check(filesChange !== equal(header.filesHash, previous.filesHash));

  return requirements[op]!(header, entry, before, onNewServer);
}

type TRequirement = (
  header: IManifestHeader,
  entry: TEntry | undefined,
  before: IDeviceListState,
  onNewServer: boolean,
) => TAuthorization;

const requirements: Record<number, TRequirement> = {
  1: () => "member",
  2: (header, entry, before) => joinRequirement(header, entry, before, 2),
  3: (header, entry, before) => joinRequirement(header, entry, before, 3),
  4: (_header, entry) => removalRequirement(entry, false),
  5: (_header, entry) => removalRequirement(entry, true),
  6: (_header, entry) => {
    check(entry?.kind === 3);

    return "member";
  },
  7: (_header, entry) => {
    check(entry?.kind === 4);

    return "member";
  },
  10: (_header, entry, _before, onNewServer) => {
    check(entry?.kind === 5);

    return onNewServer ? "move-import" : "move-session";
  },
  11: () => "repair-token",
  12: (_header, entry) => {
    check(entry?.kind === 6);

    return "repair-token";
  },
  13: (header, entry) => {
    check(entry?.kind === 7 && equal(header.signer, entry.signer));

    return "member";
  },
};

function joinRequirement(
  header: IManifestHeader,
  entry: TEntry | undefined,
  before: IDeviceListState,
  op: 2 | 3,
): TAuthorization {
  check(entry?.kind === 1);
  check(equal(entry.signer, before.recovery.id) === (op === 3));
  if (op === 3) check(equal(header.signer, entry.payload.device.id));

  return op === 2 ? "join-grant" : "join-ticket";
}

function removalRequirement(entry: TEntry | undefined, replaceRecovery: boolean): TAuthorization {
  check(entry?.kind === 2 && (entry.payload.newRecovery !== undefined) === replaceRecovery);

  return replaceRecovery ? "member" : "member-or-repair-token";
}
