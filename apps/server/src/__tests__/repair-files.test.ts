import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";
import { startRestored } from "../repair/start.ts";

test("two-device repair extends history, stores reports, drops a device and accepts lost files", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();

    const add = p.signObject(
      p.EntryCodec,
      {
        vaultId: f.vaultId,
        seq: 2n,
        parent: f.state.head,
        kind: 1,
        payload: {
          device: f.b.record,
          wrap: { recipient: f.b.record.id, enc: p.randomBytes(32), ct: p.randomBytes(48) },
        },
        signer: f.recovery.id,
      },
      f.recoveryKeys.objSk,
      "entry",
    );

    const join = f.next(
      f.create.header,
      { op: 3, listSeq: 2n, listHead: p.objectHash(p.EntryCodec, add, "entry") },
      [add],
      f.b,
    );

    f.storage.putSession(
      f.vaultId,
      { kind: "join-ticket", device: f.b.record.id, purpose: "kit" },
      new Uint8Array([1]),
      f.options.now(),
    );

    expect((await f.send(join, f.b)).status).toBe(200);
    const token = startRestored(f.options).find((item) => p.equal(item.vaultId, f.vaultId))!.token;
    const secret = p.decodeToken("repair", token).secret;
    const repairId = p.H("repair-id", secret);
    const proof = (r: p.IRequest) => p.tokenProof("repair", p.tokenKey("repair", secret), r);

    const files = {
      entries: [
        {
          fileId: p.randomBytes(32),
          version: 1n,
          epoch: 1,
          state: 1,
          blobHash: p.randomBytes(32),
          name: p.randomBytes(32),
        },
      ],
    };

    const push = f.next(join.header, { op: 1, filesHash: p.H("files", p.FilesCodec.write(files)) });
    push.files = files;

    expect(
      (await f.request("/v1/repair/history", p.SwapCodec.write(push), f.a, proof)).status,
    ).toBe(200);

    for (const who of [f.a, f.b]) {
      const report = p.signObject(
        p.RepairReportCodec,
        {
          vaultId: f.vaultId,
          repairId,
          head: p.objectHash(p.ManifestHeaderCodec, push.header, "manifest"),
          blobs: [],
          signer: who.record.id,
        },
        who.keys.objSk,
        "repair-report",
      );

      expect(
        (
          await f.request(
            "/v1/repair/report",
            p.signedCodec(p.RepairReportCodec).write(report),
            who,
            proof,
            "PUT",
          )
        ).status,
      ).toBe(200);
    }

    const reports = await f.request("/v1/repair/reports", undefined, f.a, proof);

    expect(await reports.json()).toMatchObject({
      objects: [expect.any(String), expect.any(String)],
    });

    const change = {
      epoch: 2,
      keyCommit: p.randomBytes(32),
      wraps: [f.a.record, f.recovery]
        .map((d) => ({ recipient: d.id, enc: p.randomBytes(32), ct: p.randomBytes(48) }))
        .sort((a, b) => p.compare(a.recipient, b.recipient)),
    };

    const remove = p.signObject(
      p.EntryCodec,
      {
        vaultId: f.vaultId,
        seq: 3n,
        parent: p.objectHash(p.EntryCodec, add, "entry"),
        kind: 2,
        payload: { device: f.b.record.id, newRecovery: undefined, change },
        signer: f.a.record.id,
      },
      f.a.keys.objSk,
      "entry",
    );

    const keyring = p.randomBytes(64);

    const drop = f.next(
      push.header,
      {
        op: 4,
        epoch: 2,
        listSeq: 3n,
        listHead: p.objectHash(p.EntryCodec, remove, "entry"),
        keyringHash: p.H("keyring-blob", keyring),
      },
      [remove],
    );

    drop.keyring = keyring;
    expect((await f.send(drop, f.a, proof)).status).toBe(200);

    const lost = {
      entries: [
        {
          ...files.entries[0]!,
          version: 2n,
          epoch: 2,
          state: 4,
          blobHash: new Uint8Array(32),
          name: p.randomBytes(32),
        },
      ],
    };

    const fix = f.next(drop.header, { op: 11, filesHash: p.H("files", p.FilesCodec.write(lost)) });
    fix.files = lost;
    expect((await f.send(fix, f.a, proof)).status).toBe(200);

    const done = p.signObject(
      p.EntryCodec,
      {
        vaultId: f.vaultId,
        seq: 4n,
        parent: p.objectHash(p.EntryCodec, remove, "entry"),
        kind: 6,
        payload: {
          repairId,
          restoredHead: p.objectHash(p.ManifestHeaderCodec, join.header, "manifest"),
        },
        signer: f.a.record.id,
      },
      f.a.keys.objSk,
      "entry",
    );

    const close = f.next(
      fix.header,
      { op: 12, listSeq: 4n, listHead: p.objectHash(p.EntryCodec, done, "entry") },
      [done],
    );

    f.storage.putSession(
      f.vaultId,
      { kind: "login", device: f.a.record.id, purpose: "repair-finish" },
      p.tokenKey("repair", secret),
      f.options.now(),
    );

    expect((await f.send(close, f.a, proof)).status).toBe(200);
    expect(f.storage.states(f.vaultId, "repair-report")).toHaveLength(0);
  } finally {
    f.close();
  }
});
