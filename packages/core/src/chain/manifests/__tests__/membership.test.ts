import { expect, test } from "bun:test";
import { EntryCodec, objectHash } from "../../../protocol/index.ts";
import { applyEntry } from "../../devices/apply.ts";
import { classifyNonMember } from "../membership.ts";
import { bytes, fixture, signedHeader } from "../../__tests__/fixtures.ts";

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

  const storedHeaders = [f.header, joined];

  const base = {
    deviceId: f.b.record.id,
    storedHeaders,
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
    payload: { repairId: bytes(4), restoredHead: objectHashForHeader(f.header) },
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
  if (done.body.kind === 6) done.body.payload.restoredHead = bytes(0);
  expect(classifyNonMember(branch).kind).toBe("fork");
});

import { ManifestHeaderCodec } from "../../../protocol/index.ts";

const objectHashForHeader = (h: ReturnType<typeof signedHeader>) =>
  objectHash(ManifestHeaderCodec, h, "manifest");
