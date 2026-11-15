import { equal, ManifestHeaderCodec, objectHash } from "../../protocol/index.ts";
import type { IManifestHeader, ISigned, TEntry } from "../../protocol/index.ts";
import { verifyChain } from "../devices/apply.ts";
import type { IDeviceListState } from "../devices/state.ts";
import { id } from "../shared/validation.ts";

interface INonMemberInput {
  deviceId: Uint8Array;
  storedHeaders: readonly ISigned<IManifestHeader>[];
  storedEntries: readonly ISigned<TEntry>[];
  verifiedHeaders: readonly ISigned<IManifestHeader>[];
  verifiedEntries: readonly ISigned<TEntry>[];
  state: IDeviceListState;
}

const hash = (h: ISigned<IManifestHeader>) => id(objectHash(ManifestHeaderCodec, h, "manifest"));

export function classifyNonMember(
  input: INonMemberInput,
):
  | { kind: "removed"; entry: ISigned<TEntry> }
  | { kind: "dropped-by-repair" | "rollback" | "fork" } {
  const { storedHeaders, verifiedHeaders, verifiedEntries, deviceId, state } = input;
  const checkpoint = storedHeaders.at(-1);
  const head = verifiedHeaders.at(-1);
  if (!checkpoint || !head) return { kind: "fork" };
  const stored = new Set(storedHeaders.map(hash));
  const descends = verifiedHeaders.some((h) => hash(h) === hash(checkpoint));

  if (state.devices.has(id(deviceId)))
    return { kind: stored.has(hash(head)) ? "rollback" : "fork" };

  if (descends) {
    const removed = verifiedEntries.find(
      (e) =>
        e.body.seq > checkpoint.body.listSeq &&
        e.body.kind === 2 &&
        equal(e.body.payload.device, deviceId),
    );

    if (removed) return { kind: "removed", entry: removed };
  }

  if (!descends && droppedByRepair(input, checkpoint, stored)) return { kind: "dropped-by-repair" };

  return { kind: stored.has(hash(head)) ? "rollback" : "fork" };
}

function droppedByRepair(
  input: INonMemberInput,
  checkpoint: ISigned<IManifestHeader>,
  stored: ReadonlySet<string>,
) {
  const { verifiedHeaders, verifiedEntries, state } = input;
  const split = verifiedHeaders.findIndex((h) => !stored.has(hash(h)));
  const former = formerMembers(input.storedEntries, checkpoint);
  if (split < 1 || !former) return false;
  const shared = verifiedHeaders.slice(0, split);
  const after = verifiedEntries.filter((e) => e.body.seq > shared.at(-1)!.body.listSeq);
  const common = new Set(shared.map(hash));

  // A removed device or replaced kit acting on the new branch is the collusion fork (§ 6).
  const formerActs =
    [...state.devices.keys(), id(state.recovery.id)].some((m) => former.has(m)) ||
    after.some((e) => former.has(id(e.body.signer))) ||
    verifiedHeaders.slice(split).some((h) => former.has(id(h.body.signer)));

  return (
    !formerActs &&
    after.some((e) => e.body.kind === 6 && common.has(id(e.body.payload.restoredHead)))
  );
}

function formerMembers(entries: readonly ISigned<TEntry>[], checkpoint: ISigned<IManifestHeader>) {
  const chain = verifyChain(entries.filter((e) => e.body.seq <= checkpoint.body.listSeq));
  if (chain.kind !== "valid" || !equal(chain.state.head, checkpoint.body.listHead)) return;
  const { everUsedIds, devices, recovery } = chain.state;

  return new Set([...everUsedIds].filter((m) => !devices.has(m) && m !== id(recovery.id)));
}
