import { expect, test } from "bun:test";
import {
  base32,
  FilesCodec,
  H,
  RepairReportCodec,
  signObject,
  objectHash,
  ManifestHeaderCodec,
} from "../../protocol/index.ts";
import {
  filterRepairReports,
  missingReportMembers,
  classifyMissingBlobs,
} from "../repair/reports.ts";
import {
  chooseRecoveryCandidate,
  refuseRecoveryProof,
  isReusedRepairToken,
} from "../repair/decisions.ts";
import { bytes, fixture } from "./fixtures.ts";

function repairFixture() {
  const f = fixture();
  const repairId = bytes(40);
  const head = objectHash(ManifestHeaderCodec, f.header, "manifest");

  const body = {
    vaultId: f.state.vaultId,
    repairId,
    head,
    blobs: [bytes(41)],
    signer: f.a.record.id,
  };

  const report = signObject(RepairReportCodec, body, f.a.keys.objSk, "repair-report");

  const input = {
    reports: [report],
    repairId,
    state: f.state,
    headerHashes: new Set([base32(head)]),
  };

  return { ...f, body, report, input };
}

test("repair keeps only signatures, repair IDs, current members and heads on chain", () => {
  const f = repairFixture();
  expect(filterRepairReports(f.input)).toHaveLength(1);
  expect(missingReportMembers(f.state, filterRepairReports(f.input))).toHaveLength(0);

  for (const body of [
    { ...f.body, repairId: bytes(0) },
    { ...f.body, head: bytes(0) },
    { ...f.body, signer: f.b.record.id },
    { ...f.body, vaultId: bytes(0) },
  ]) {
    const report = signObject(RepairReportCodec, body, f.a.keys.objSk, "repair-report");
    expect(filterRepairReports({ ...f.input, reports: [report] })).toHaveLength(0);
  }

  expect(
    filterRepairReports({ ...f.input, reports: [{ ...f.report, signature: bytes(0, 64) }] }),
  ).toHaveLength(0);

  expect(missingReportMembers(f.state, [])).toEqual([f.a.record]);
});

test("missing live blobs listed in a report block finish; others are lost", () => {
  const f = repairFixture();

  const live = {
    fileId: bytes(1),
    version: 1n,
    epoch: 1,
    state: 1,
    blobHash: bytes(41),
    name: bytes(2),
  };

  const lost = { ...live, fileId: bytes(2), blobHash: bytes(42), state: 3 };
  const deleted = { ...live, fileId: bytes(3), blobHash: bytes(0), state: 2 };
  const files = { entries: [live, lost, deleted] };

  expect(classifyMissingBlobs(files, new Set(), [f.report])).toEqual({
    missing: [live],
    lost: [lost],
  });

  expect(
    classifyMissingBlobs(files, new Set([base32(live.blobHash), base32(lost.blobHash)]), []),
  ).toEqual({ missing: [], lost: [] });
});

test("candidate chooses newest existing older version and stops at tombstones or missing lists", () => {
  const f = fixture();

  const entry = {
    fileId: bytes(1),
    version: 1n,
    epoch: 1,
    state: 1,
    blobHash: bytes(2),
    name: bytes(3),
  };

  const history = [1n, 2n, 3n].map((version) => {
    const files = { entries: [{ ...entry, version, blobHash: bytes(Number(version)) }] };

    return {
      header: { ...f.header.body, seq: version, filesHash: H("files", FilesCodec.write(files)) },
      files,
    };
  });

  const input = {
    fileId: entry.fileId,
    beforeVersion: 4n,
    history,
    availableBlobs: new Set([base32(bytes(1)), base32(bytes(2))]),
  };

  const result = chooseRecoveryCandidate(input);
  expect(result.kind).toBe("recovered");
  if (result.kind === "recovered") expect(result.entry.version).toBe(2n);

  expect(
    chooseRecoveryCandidate({
      ...input,
      history: [{ header: history[2]!.header, files: undefined }, ...history],
    }).kind,
  ).toBe("lost");

  const tombstone = { entries: [{ ...entry, version: 3n, state: 2, blobHash: bytes(0) }] };

  const deleted = {
    header: { ...history[2]!.header, filesHash: H("files", FilesCodec.write(tombstone)) },
    files: tombstone,
  };

  expect(
    chooseRecoveryCandidate({ ...input, history: [deleted, ...history.slice(0, 2)] }).kind,
  ).toBe("lost");

  expect(chooseRecoveryCandidate({ ...input, availableBlobs: new Set() }).kind).toBe("lost");

  expect(
    chooseRecoveryCandidate({
      ...input,
      history: [{ ...history[2]!, header: { ...history[2]!.header, filesHash: bytes(0) } }],
    }).kind,
  ).toBe("lost");
});

test("recovery proof refusal derives from post-restore operations and envelope match", () => {
  const f = fixture();

  for (let op = 1; op <= 13; op++) {
    const headers = [{ ...f.header.body, op }];
    expect(refuseRecoveryProof(headers, true)).toBe([5, 7].includes(op));
    expect(refuseRecoveryProof(headers, false)).toBe(true);
  }

  expect(refuseRecoveryProof([], true)).toBe(false);
  expect(isReusedRepairToken(bytes(1), new Set([base32(bytes(1))]))).toBe(true);
  expect(isReusedRepairToken(bytes(2), new Set([base32(bytes(1))]))).toBe(false);
});
