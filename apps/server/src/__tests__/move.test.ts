import { test, expect, spyOn } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";

for (const lostAfterCommit of [false, true])
  test(`move survives initiator loss ${lostAfterCommit ? "after" : "before"} old-server commit`, async () => {
    const o = await vaultFixture();
    const n = await vaultFixture();

    try {
      await o.initialize();
      n.useVault(o.vaultId);
      const setupProof = (r: p.IRequest) => p.tokenProof("setup", n.setup, r);

      expect((await n.request("/v1/move/session", new Uint8Array(), o.a, setupProof)).status).toBe(
        200,
      );

      expect((await n.request("/v1/head", undefined, o.b)).status).toBe(409);
      expect((await o.request("/v1/move/freeze", new Uint8Array())).status).toBe(200);

      expect((await n.request("/v1/move/history", p.SwapCodec.write(o.create), o.a)).status).toBe(
        200,
      );

      const add = p.signObject(
        p.EntryCodec,
        {
          vaultId: o.vaultId,
          seq: 2n,
          parent: o.state.head,
          kind: 1,
          payload: {
            device: o.b.record,
            wrap: { recipient: o.b.record.id, enc: p.randomBytes(32), ct: p.randomBytes(48) },
          },
          signer: o.recovery.id,
        },
        o.recoveryKeys.objSk,
        "entry",
      );

      const join = o.next(
        o.create.header,
        { op: 3, listSeq: 2n, listHead: p.objectHash(p.EntryCodec, add, "entry") },
        [add],
        o.b,
      );

      expect((await o.request("/v1/move/unfreeze", new Uint8Array())).status).toBe(200);

      o.storage.putSession(
        o.vaultId,
        { kind: "join-ticket", device: o.b.record.id, purpose: "recovery" },
        new Uint8Array([1]),
        o.options.now(),
      );

      expect((await o.send(join, o.b)).status).toBe(200);
      expect((await n.request("/v1/move/history", p.SwapCodec.write(join), o.a)).status).toBe(200);

      o.storage.putDevice(o.vaultId, o.b.record.id, { clientVersion: "1.0.0" });

      const owner = lostAfterCommit ? o.a : o.b;
      expect((await o.request("/v1/move/freeze", new Uint8Array(), owner)).status).toBe(200);

      const moved = p.signObject(
        p.EntryCodec,
        {
          vaultId: o.vaultId,
          seq: 3n,
          parent: p.objectHash(p.EntryCodec, add, "entry"),
          kind: 5,
          payload: {
            oldPin: p.serverPin(o.options.serverKeys.publicKey),
            newPin: p.serverPin(n.options.serverKeys.publicKey),
            newAddress: "new.example",
          },
          signer: owner.record.id,
        },
        owner.keys.objSk,
        "entry",
      );

      const swap = o.next(
        join.header,
        { op: 10, listSeq: 3n, listHead: p.objectHash(p.EntryCodec, moved, "entry") },
        [moved],
        owner,
      );

      expect((await o.send(swap, owner)).status).toBe(200);
      expect((await o.request("/v1/move/unfreeze", new Uint8Array(), o.b)).status).toBe(409);
      const originalState = n.storage.state.bind(n.storage);

      for (const missing of ["files", "keyring", "envelope", "proofPub"]) {
        const read =
          missing === "files"
            ? spyOn(n.storage, "fileList").mockReturnValue(undefined)
            : spyOn(n.storage, "state").mockImplementation((vault, kind, key) => {
                if (kind === missing) return undefined;

                return originalState(vault, kind, key);
              });

        try {
          expect((await n.request("/v1/swap", p.SwapCodec.write(swap), o.b)).status).toBe(400);
          expect(n.storage.vault(o.vaultId)!.active).toBe(false);
        } finally {
          read.mockRestore();
        }
      }

      const forwarded = await n.request("/v1/swap", p.SwapCodec.write(swap), o.b);
      expect(forwarded.status).toBe(200);
      expect(n.storage.vault(o.vaultId)!.active).toBe(true);
      expect((await n.request("/v1/swap", p.SwapCodec.write(swap), o.b)).status).toBe(200);
    } finally {
      o.close();
      n.close();
    }
  });

test("discard never resurrects consumed setup tokens", async () => {
  const f = await vaultFixture();

  try {
    const proof = (r: p.IRequest) => p.tokenProof("setup", f.setup, r);
    expect((await f.request("/v1/move/session", new Uint8Array(), f.a, proof)).status).toBe(200);

    f.storage.writeState(f.vaultId, [
      { kind: "move-session", key: new TextEncoder().encode("setup"), bytes: f.setup },
    ]);

    const replacement = p.tokenKey("setup", p.randomBytes(20));
    f.storage.setSetupToken(replacement);
    expect((await f.request("/v1/move/discard", new Uint8Array())).status).toBe(200);
    expect(f.storage.setupToken()).toEqual(replacement);
    expect(f.storage.setupToken()).not.toEqual(f.setup);
  } finally {
    f.close();
  }
});

test("moves refuse stale proof key export and freeze until the code is replaced", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();
    f.storage.configureVault(f.vaultId, { ...f.storage.vault(f.vaultId)!, proofRefused: true });

    expect(await (await f.request("/v1/move/proof-pub")).json()).toEqual({
      error: "RECOVERY_CODE_REQUIRED",
    });

    expect(await (await f.request("/v1/move/freeze", new Uint8Array())).json()).toEqual({
      error: "RECOVERY_CODE_REQUIRED",
    });

    expect(f.storage.vault(f.vaultId)!.frozen).toBe(false);
    expect((await f.request("/v1/move/unfreeze", new Uint8Array())).status).toBe(200);
  } finally {
    f.close();
  }
});
