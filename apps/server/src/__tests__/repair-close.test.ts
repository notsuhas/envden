import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";
import { startRestored } from "../repair/start.ts";

test.each([false, true])(
  "restored mode finishes a repair; backup frozen for a move: %p",
  restoreAndRepair,
);

async function restoreAndRepair(frozen: boolean) {
  const f = await vaultFixture();

  try {
    await f.initialize();

    if (frozen)
      f.storage.configureVault(f.vaultId, { ...f.storage.vault(f.vaultId)!, frozen: true }, [
        { kind: "move-session", key: new Uint8Array(), bytes: f.a.record.id },
      ]);

    const first = startRestored(f.options).find((item) => p.equal(item.vaultId, f.vaultId))!;
    const point = f.storage.vault(f.vaultId)!.restored!.restoredHead;
    const second = startRestored(f.options).find((item) => p.equal(item.vaultId, f.vaultId))!;
    expect(f.storage.vault(f.vaultId)!.restored!.restoredHead).toEqual(point);
    expect(f.storage.state(f.vaultId, "move-session", new Uint8Array())).toBeUndefined();

    const proofFor = (token: string) => (r: p.IRequest) =>
      p.tokenProof("repair", p.tokenKey("repair", p.decodeToken("repair", token).secret), r);

    expect((await f.request("/v1/head")).status).toBe(409);
    expect((await f.request("/v1/head", undefined, f.a, proofFor(first.token!))).status).toBe(409);
    const proof = proofFor(second.token!);
    expect((await f.request("/v1/head", undefined, f.a, proof)).status).toBe(200);

    expect((await f.request("/v1/join-requests", undefined, f.a, proof)).status).toBe(409);

    const repairId = p.H("repair-id", p.decodeToken("repair", second.token!).secret);

    const e = p.signObject(
      p.EntryCodec,
      {
        vaultId: f.vaultId,
        seq: 2n,
        parent: f.state.head,
        kind: 6,
        payload: { repairId, restoredHead: point },
        signer: f.a.record.id,
      },
      f.a.keys.objSk,
      "entry",
    );

    const swap = f.next(
      f.create.header,
      { op: 12, listSeq: 2n, listHead: p.objectHash(p.EntryCodec, e, "entry") },
      [e],
    );

    expect((await f.send(swap, f.a)).status).toBe(409);
    expect((await f.send(swap, f.a, proof)).status).toBe(200);
    expect(f.storage.vault(f.vaultId)!.restored).toBeUndefined();
    expect((await f.request("/v1/repair/status", undefined, f.a, proof)).status).toBe(401);
  } finally {
    f.close();
  }
}
