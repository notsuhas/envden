import { test, expect } from "bun:test";
import * as p from "../../index.ts";

const rng = (n: number) => new Uint8Array(n).fill(9),
  keys = p.generateDeviceKeys(rng),
  recovery = p.generateRecoveryKeys(rng),
  z = new Uint8Array(32),
  id = p.deviceId(keys);

const device = { id, name: "test", encPub: keys.encPub, objPub: keys.objPub, reqPub: keys.reqPub },
  rec = { id: p.recoveryId(recovery), encPub: recovery.encPub, objPub: recovery.objPub },
  wrap = { recipient: id, enc: z, ct: new Uint8Array(48) },
  change = { epoch: 1, keyCommit: z, wraps: [wrap] };

const manifest = {
  vaultId: z,
  seq: 1n,
  op: 0,
  prev: z,
  listSeq: 1n,
  listHead: z,
  epoch: 1,
  keyringHash: z,
  filesHash: z,
  envelopeHash: z,
  createdAt: 1n,
  signer: id,
};

function round<T>(c: p.ICodec<T>, value: T) {
  const bytes = p.encode(c, value);
  expect(p.decode(c, bytes)).toEqual(value);
  expect(() => p.decode(c, p.concat(bytes, Uint8Array.of(0)))).toThrow();
  for (let i = 0; i < bytes.length; i++) expect(() => p.decode(c, bytes.slice(0, i))).toThrow();
}

test("all entry payloads round trip; unknown kind/type/version rejected", () => {
  const variants: p.TEntryPayload[] = [
    { kind: 0, payload: { serverPin: z, device, recovery: rec, vaultNonce: z, createdAt: 1n } },
    { kind: 1, payload: { device, wrap } },
    { kind: 2, payload: { device: id, newRecovery: rec, change } },
    { kind: 3, payload: { change } },
    { kind: 4, payload: { recovery: rec, change } },
    { kind: 5, payload: { oldPin: z, newPin: z, newAddress: "server.example" } },
    { kind: 6, payload: { repairId: z, restoredHead: z } },
    { kind: 7, payload: { device: id, name: "laptop" } },
  ];

  for (const variant of variants) {
    const entry = { vaultId: z, seq: 0n, parent: z, ...variant, signer: id };
    round(p.EntryCodec, entry);
    const bytes = p.encode(p.EntryCodec, entry);

    for (const [offset, v] of [
      [0, 255],
      [1, 2],
      [74, 8],
    ]) {
      const bad = bytes.slice();
      bad[offset!] = v!;

      expect(() => p.decode(p.EntryCodec, bad)).toThrow(
        expect.objectContaining({ code: "UPDATE_REQUIRED" }),
      );
    }
  }
});

test("every structured codec is exact and validates nested records", () => {
  round(p.DeviceRecordCodec, device);
  round(p.RecoveryRecordCodec, rec);
  round(p.WrapCodec, wrap);
  round(p.EpochChangeCodec, change);
  round(p.ManifestHeaderCodec, manifest);
  round(p.JoinOfferCodec, { vaultId: z, nonce: z });
  round(p.JoinRevealCodec, { device, nonce: z });
  round(p.JoinApprovedCodec, { vaultId: z, serverPin: z, manifestHash: z });
  round(p.RepairReportCodec, { vaultId: z, repairId: z, head: z, blobs: [z], signer: id });

  round(p.EnvelopeCodec, {
    vaultId: z,
    recoveryEncSk: z,
    recoveryObjSk: z,
    checkpoint: z,
    sealedAt: 1n,
  });

  round(p.KeyringCodec, { vaultId: z, epoch: 2, idKey: z, older: [{ epoch: 1, key: z }] });

  round(p.FilesCodec, {
    entries: [{ fileId: z, version: 1n, epoch: 1, state: 1, blobHash: z.with(0, 1), name: z }],
  });

  const header = p.signObject(p.ManifestHeaderCodec, manifest, keys.objSk, "manifest");

  round(p.SwapCodec, {
    expectedHead: z,
    entries: [],
    header,
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    proofPub: undefined,
    approver: undefined,
  });
});

test("semantic rejection rules", () => {
  expect(() => p.encode(p.DeviceRecordCodec, { ...device, id: new Uint8Array(16) })).toThrow();

  for (const name of ["", "a".repeat(65), "laptop\u200B", "\u202Elaptop"]) {
    expect(() => p.encode(p.DeviceRecordCodec, { ...device, name })).toThrow();
    expect(() => p.encode(p.RenameDeviceCodec, { device: id, name })).toThrow();
  }

  expect(() => p.encode(p.RecoveryRecordCodec, { ...rec, id: new Uint8Array(16) })).toThrow();
  expect(() => p.encode(p.WrapCodec, { ...wrap, ct: z })).toThrow();
  expect(() => p.encode(p.EpochChangeCodec, { ...change, wraps: [wrap, wrap] })).toThrow();
  expect(() => p.encode(p.ManifestHeaderCodec, { ...manifest, op: 14 })).toThrow();

  expect(() =>
    p.encode(p.KeyringCodec, { vaultId: z, epoch: 3, idKey: z, older: [{ epoch: 2, key: z }] }),
  ).toThrow();

  for (const state of [0, 1, 3, 5])
    expect(() =>
      p.encode(p.FileEntryCodec, { fileId: z, version: 1n, epoch: 1, state, blobHash: z, name: z }),
    ).toThrow();

  expect(() =>
    p.encode(p.FileCodec, { repoId: "repo", path: "a", content: new Uint8Array(1048577) }),
  ).toThrow();

  expect(() =>
    p.encode(p.FilesCodec, {
      entries: [
        {
          fileId: z,
          version: 1n,
          epoch: 1,
          state: 2,
          blobHash: new Uint8Array(32).fill(1),
          name: z,
        },
      ],
    }),
  ).toThrow();
});

test("malformed bytes have coded errors and future operations require an update", () => {
  for (const bytes of [
    new Uint8Array(),
    Uint8Array.of(1),
    p.concat(
      p.EntryCodec.write({
        vaultId: z,
        seq: 0n,
        parent: z,
        kind: 3,
        payload: { change },
        signer: id,
      }),
      Uint8Array.of(0),
    ),
  ])
    expect(() => p.decode(p.EntryCodec, bytes)).toThrow(
      expect.objectContaining({ code: "INVALID_DATA" }),
    );

  const future = p.ManifestHeaderCodec.write(manifest);

  const manifestOperationOffset =
    p.header(2).length + manifest.vaultId.length + p.u64.write(manifest.seq).length;

  future[manifestOperationOffset] = 14;

  expect(() => p.decode(p.ManifestHeaderCodec, future)).toThrow(
    expect.objectContaining({ code: "UPDATE_REQUIRED" }),
  );
});

test("member codecs reject low-order and noncanonical encryption keys with matching IDs", () => {
  for (const encPub of [
    keys.encPub.with(31, keys.encPub[31]! | 0x80),
    Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 0xf6 : i === 31 ? 0x7f : 0xff)),
    z,
    Uint8Array.of(1, ...new Uint8Array(31)),
    Uint8Array.from(
      Buffer.from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800", "hex"),
    ),
  ]) {
    const d = { ...device, encPub };
    const r = { ...rec, encPub };
    d.id = p.deviceId(d);
    r.id = p.recoveryId(r);

    expect(() => p.DeviceRecordCodec.write(d)).toThrow(
      expect.objectContaining({ code: "INVALID_DATA" }),
    );

    expect(() => p.RecoveryRecordCodec.write(r)).toThrow(
      expect.objectContaining({ code: "INVALID_DATA" }),
    );

    const deviceBytes = p.DeviceRecordCodec.write(device);
    deviceBytes.set(d.id, 0);
    deviceBytes.set(encPub, 16 + p.str.write(device.name).length);
    const recoveryBytes = p.concat(r.id, encPub, r.objPub);
    expect(() => p.decode(p.DeviceRecordCodec, deviceBytes)).toThrow();
    expect(() => p.decode(p.RecoveryRecordCodec, recoveryBytes)).toThrow();
  }
});

test("server data strings are bounded by the largest object they carry", () => {
  const objects = (length: number) =>
    p.ObjectsResponseSchema.safeParse({ objects: ["A".repeat(length)] }).success;

  const status = (length: number) =>
    p.RepairStatusSchema.safeParse({ restoredHead: "A".repeat(length), repairId: "A" }).success;

  expect([objects(4266910), objects(4266911)]).toEqual([true, false]);
  expect([status(43), status(44)]).toEqual([true, false]);
});
