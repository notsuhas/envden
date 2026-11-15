import { signObject, EntryCodec, ManifestHeaderCodec, objectHash } from "../../protocol/index.ts";
import type { ISigned, TEntry, IManifestHeader } from "../../protocol/index.ts";
import type { device, fixture } from "./fixtures.ts";
import { bytes } from "./fixtures.ts";

export function operationEntries(
  op: number,
  f: ReturnType<typeof fixture>,
  state: ReturnType<typeof fixture>["state"],
  previous: ISigned<IManifestHeader>,
  removed: ReturnType<typeof device>,
  nextRecovery: ReturnType<typeof fixture>["recovery"],
) {
  let entries: ISigned<TEntry>[] = [];

  if (op === 2 || op === 3) return joinEntries(op, f, state);

  if (op === 4 || op === 5)
    entries = [
      f.entry(state, {
        kind: 2,
        payload: {
          device: removed.record.id,
          newRecovery: op === 5 ? nextRecovery : undefined,
          change: f.change(state, [f.a.record], op === 5 ? nextRecovery : state.recovery),
        },
      }),
    ];

  if (op === 6) entries = [f.entry(state, { kind: 3, payload: { change: f.change(state) } })];

  if (op === 7 || op === 9)
    entries = [
      f.entry(state, {
        kind: 4,
        payload: {
          recovery: nextRecovery,
          change: f.change(state, [...state.devices.values()], nextRecovery),
        },
      }),
    ];

  if (op === 10)
    entries = [
      f.entry(state, {
        kind: 5,
        payload: { oldPin: state.serverPin, newPin: bytes(15), newAddress: "next.example" },
      }),
    ];

  if (op === 12)
    entries = [
      f.entry(state, {
        kind: 6,
        payload: {
          repairId: bytes(16),
          restoredHead: objectHash(ManifestHeaderCodec, previous, "manifest"),
        },
      }),
    ];

  if (op === 13)
    entries = [f.entry(state, { kind: 7, payload: { device: f.a.record.id, name: "laptop" } })];

  return entries;
}

function joinEntries(
  op: number,
  f: ReturnType<typeof fixture>,
  state: ReturnType<typeof fixture>["state"],
) {
  const body: TEntry = {
    vaultId: state.vaultId,
    parent: state.head,
    seq: state.seq + 1n,
    kind: 1,
    payload: {
      device: f.b.record,
      wrap: { recipient: f.b.record.id, enc: bytes(1), ct: bytes(2, 48) },
    },
    signer: op === 3 ? f.recovery.id : f.a.record.id,
  };

  return [signObject(EntryCodec, body, op === 3 ? f.recoveryKeys.objSk : f.a.keys.objSk, "entry")];
}
