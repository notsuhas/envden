import { expect, test } from "bun:test";
import { EntryCodec, ManifestHeaderCodec, objectHash } from "../../../protocol/index.ts";
import type { IManifestHeader, ISigned, TEntryPayload } from "../../../protocol/index.ts";
import { applyEntry } from "../../devices/apply.ts";
import type { IDeviceListState } from "../../devices/state.ts";
import { classifyNonMember } from "../membership.ts";
import { bytes, device, fixture, signedHeader } from "../../__tests__/fixtures.ts";

const headerHash = (h: ISigned<IManifestHeader>) => objectHash(ManifestHeaderCodec, h, "manifest");

test("non-member classifies removal, repair drop, pre-join rollback and forks", () => {
  const f = fixture();

  const add = f.entry(f.state, {
    kind: 1,
    payload: {
      device: f.b.record,
      wrap: { recipient: f.b.record.id, enc: bytes(1), ct: bytes(2, 48) },
    },
  });

  const added = applyEntry(f.state, add);
  if (added.kind !== "valid") throw new Error("fixture");

  const joined = signedHeader(f.header, {
    op: 2,
    listSeq: added.state.seq,
    listHead: added.state.head,
  });

  const remove = f.entry(added.state, {
    kind: 2,
    payload: {
      device: f.b.record.id,
      newRecovery: undefined,
      change: f.change(added.state, [f.a.record]),
    },
  });

  const removed = applyEntry(added.state, remove);
  if (removed.kind !== "valid") throw new Error("fixture");

  const removal = signedHeader(joined, {
    op: 4,
    listSeq: removed.state.seq,
    listHead: removed.state.head,
    epoch: 2,
    keyringHash: bytes(3),
  });

  const base = {
    deviceId: f.b.record.id,
    storedHeaders: [f.header, joined],
    storedEntries: [f.genesis, f.epoch, add],
    verifiedHeaders: [f.header, joined, removal],
    verifiedEntries: [add, remove],
    state: removed.state,
  };

  expect(classifyNonMember(base).kind).toBe("removed");

  expect(
    classifyNonMember({ ...base, verifiedHeaders: [f.header], verifiedEntries: [], state: f.state })
      .kind,
  ).toBe("rollback");

  const done = f.entry(f.state, {
    kind: 6,
    payload: { repairId: bytes(4), restoredHead: headerHash(f.header) },
  });

  const repairHeader = signedHeader(f.header, {
    op: 12,
    listSeq: done.body.seq,
    listHead: objectHash(EntryCodec, done, "entry"),
  });

  const branch = {
    ...base,
    verifiedHeaders: [f.header, repairHeader],
    verifiedEntries: [done],
    state: f.state,
  };

  expect(classifyNonMember(branch).kind).toBe("dropped-by-repair");
  expect(classifyNonMember({ ...branch, deviceId: f.a.record.id }).kind).toBe("fork");
  expect(classifyNonMember({ ...branch, verifiedEntries: [] }).kind).toBe("fork");
  expect(classifyNonMember({ ...branch, verifiedHeaders: [repairHeader] }).kind).toBe("fork");
  if (done.body.kind === 6) done.body.payload.restoredHead = headerHash(joined);
  expect(classifyNonMember(branch).kind).toBe("fork");
  if (done.body.kind === 6) done.body.payload.restoredHead = bytes(0);
  expect(classifyNonMember(branch).kind).toBe("fork");
});

test("a repair drop is a fork when a device removed on the stored chain acts on the new branch", () => {
  const f = fixture();
  const r = device(3);
  const r2 = device(4);
  const chain = builder(f);

  const addD = chain.step(f.state, addPayload(f.b.record));
  const addR = chain.step(addD.state, addPayload(r.record));
  const joined = signedHeader(f.header, at(addD.state, 2));
  const restored = signedHeader(joined, at(addR.state, 2));

  const removeR = chain.step(addR.state, removePayload(f, addR.state, r.record.id));
  const checkpoint = signedHeader(restored, at(removeR.state, 4));

  const stored = {
    deviceId: f.b.record.id,
    storedHeaders: [f.header, joined, restored, checkpoint],
    storedEntries: [f.genesis, f.epoch, addD.entry, addR.entry, removeR.entry],
  };

  const forked = (steps: [TEntryPayload, typeof r][]) => {
    let state = addR.state;
    let header = restored;
    const headers = [f.header, joined, restored];
    const entries = [f.genesis, f.epoch, addD.entry, addR.entry];

    for (const [payload, signer] of steps) {
      const next = chain.step(state, rewrap(f, state, payload), signer);
      state = next.state;
      entries.push(next.entry);
      header = signedHeader(header, at(state, 4), signer);
      headers.push(header);
    }

    return classifyNonMember({
      ...stored,
      verifiedHeaders: headers,
      verifiedEntries: entries,
      state,
    }).kind;
  };

  const removeD = removePayload(f, addR.state, f.b.record.id);
  const dropR = removePayload(f, addR.state, r.record.id);
  const done = donePayload(restored);

  expect(
    forked([
      [removeD, f.a],
      [dropR, f.a],
      [done, f.a],
    ]),
  ).toBe("dropped-by-repair");

  expect(
    forked([
      [removeD, f.a],
      [done, f.a],
    ]),
  ).toBe("fork");

  expect(
    forked([
      [removeD, r],
      [done, r],
    ]),
  ).toBe("fork");

  expect(
    forked([
      [addPayload(r2.record), r],
      [dropR, r2],
      [removeD, r2],
      [done, r2],
    ]),
  ).toBe("fork");
});

function builder(f: ReturnType<typeof fixture>) {
  return {
    step(state: IDeviceListState, payload: TEntryPayload, signer = f.a) {
      const entry = f.entry(state, payload, signer);
      const next = applyEntry(state, entry);
      if (next.kind !== "valid") throw new Error("fixture");

      return { entry, state: next.state };
    },
  };
}

function at(state: IDeviceListState, op: number): Partial<IManifestHeader> {
  return { op, listSeq: state.seq, listHead: state.head, epoch: state.epoch };
}

function addPayload(record: ReturnType<typeof device>["record"]): TEntryPayload {
  return {
    kind: 1,
    payload: { device: record, wrap: { recipient: record.id, enc: bytes(1), ct: bytes(2, 48) } },
  };
}

function removePayload(
  f: ReturnType<typeof fixture>,
  state: IDeviceListState,
  removed: Uint8Array,
): TEntryPayload {
  const kept = [...state.devices.values()].filter((d) => !d.id.every((b, i) => b === removed[i]));

  return {
    kind: 2,
    payload: { device: removed, newRecovery: undefined, change: f.change(state, kept) },
  };
}

function donePayload(restored: ISigned<IManifestHeader>): TEntryPayload {
  return { kind: 6, payload: { repairId: bytes(4), restoredHead: headerHash(restored) } };
}

function rewrap(
  f: ReturnType<typeof fixture>,
  state: IDeviceListState,
  payload: TEntryPayload,
): TEntryPayload {
  return payload.kind === 2 ? removePayload(f, state, payload.payload.device) : payload;
}
