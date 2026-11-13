import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { acceptedLostRepair, reportedRepair } from "./repair-file-fixture.ts";
import { membership } from "../vault/chain.ts";

test("repair drops an unreported member before accepting lost files", async () => {
  const { f } = await acceptedLostRepair();

  try {
    expect(membership(f.storage, f.vaultId, f.b.record.id)).toBeUndefined();
  } finally {
    f.close();
  }
});

test("repair stores independent device reports", async () => {
  const { f, proof } = await reportedRepair();

  try {
    const reports = await f.request("/v1/repair/reports", undefined, f.a, proof);

    expect(await reports.json()).toMatchObject({
      objects: [expect.any(String), expect.any(String)],
    });
  } finally {
    f.close();
  }
});

test("repair close consumes reports", async () => {
  const { f, remove, repairId, join, fix, secret, proof } = await acceptedLostRepair();

  try {
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
