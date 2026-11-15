import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { acceptedLostRepair } from "./repair-file-fixture.ts";
import { membership } from "../vault/chain.ts";

test("repair keeps device reports, drops unreported members and consumes reports on close", async () => {
  const { f, remove, repairId, join, fix, secret, proof } = await acceptedLostRepair();

  try {
    const reports = await f.request("/v1/repair/reports", undefined, f.a, proof);

    expect(await reports.json()).toMatchObject({
      objects: [expect.any(String), expect.any(String)],
    });

    expect(membership(f.storage, f.vaultId, f.b.record.id)).toBeUndefined();

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
