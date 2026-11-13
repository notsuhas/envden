import { transitionEntry } from "./mutate.ts";
import { EntryCodec, equal, objectHash, verifyObject } from "../../../protocol/index.ts";
import type { ISigned, TEntry } from "../../../protocol/index.ts";
import { check, id } from "../../shared/validation.ts";
import type { IDeviceListState } from "../state.ts";

export function apply(
  state: IDeviceListState | undefined,
  signed: ISigned<TEntry>,
): IDeviceListState {
  const e = signed.body;
  EntryCodec.write(e);
  const head = objectHash(EntryCodec, signed, "entry");

  if (!state) return createState(signed, head);

  check(equal(e.vaultId, state.vaultId) && e.seq === state.seq + 1n && equal(e.parent, state.head));
  check(e.seq !== 1n || e.kind === 3);
  const signer = state.devices.get(id(e.signer));
  const recoverySigned = equal(e.signer, state.recovery.id);
  check(signer || (recoverySigned && e.kind === 1));
  check(verifyObject(EntryCodec, signed, signer?.objPub ?? state.recovery.objPub, "entry").ok);

  const { devices, everUsedIds, repairIds, commits, recovery, serverPin } = transitionEntry(
    state,
    e,
  );

  let epoch = state.epoch;

  if (e.kind === 4 || (e.kind === 2 && e.payload.newRecovery !== undefined)) {
    check(!everUsedIds.has(id(recovery.id)));
    everUsedIds.add(id(recovery.id));
  }

  if (e.kind === 2 || e.kind === 3 || e.kind === 4) {
    const change = e.payload.change;
    check(change.epoch === epoch + 1);
    const members = new Set([...devices.keys(), id(recovery.id)]);

    check(
      change.wraps.length === members.size &&
        change.wraps.every((w) => members.has(id(w.recipient))),
    );

    epoch = change.epoch;
    commits.set(epoch, change.keyCommit);
  }

  return {
    ...state,
    seq: e.seq,
    head,
    devices,
    recovery,
    epoch,
    serverPin,
    everUsedIds,
    repairIds,
    commits,
  };
}

function createState(signed: ISigned<TEntry>, head: Uint8Array): IDeviceListState {
  const e = signed.body;

  check(
    e.kind === 0 &&
      e.seq === 0n &&
      e.vaultId.every((b) => b === 0) &&
      e.parent.every((b) => b === 0),
  );

  check(equal(e.signer, e.payload.device.id));
  check(verifyObject(EntryCodec, signed, e.payload.device.objPub, "entry").ok);
  check(!equal(e.payload.device.id, e.payload.recovery.id));

  return {
    vaultId: head,
    seq: 0n,
    head,
    devices: new Map([[id(e.payload.device.id), e.payload.device]]),
    recovery: e.payload.recovery,
    epoch: 0,
    serverPin: e.payload.serverPin,
    everUsedIds: new Set([id(e.payload.device.id), id(e.payload.recovery.id)]),
    repairIds: new Set(),
    commits: new Map(),
  };
}
