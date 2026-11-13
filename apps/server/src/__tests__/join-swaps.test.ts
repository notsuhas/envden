import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";
import { membership } from "../vault/chain.ts";

for (const op of [2, 3])
  test(`op ${op} joins once and assigns unlock without fresh`, async () => {
    const f = await vaultFixture();

    try {
      await f.initialize();

      const e = p.signObject(
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
          signer: op === 2 ? f.a.record.id : f.recovery.id,
        },
        op === 2 ? f.a.keys.objSk : f.recoveryKeys.objSk,
        "entry",
      );

      const swap = f.next(
        f.create.header,
        { op, listSeq: 2n, listHead: p.objectHash(p.EntryCodec, e, "entry") },
        [e],
        op === 2 ? f.a : f.b,
      );

      if (op === 2)
        swap.approver = p.sealPairApprover(
          {
            vaultId: f.vaultId,
            serverPin: p.serverPin(f.options.serverKeys.publicKey),
            manifestHash: p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"),
          },
          p.randomBytes(32),
        );

      const who = op === 2 ? f.a : f.b;
      expect((await f.send(swap, who)).status).toBe(401);
      let path = "/v1/swap";

      if (op === 3)
        f.storage.putSession(
          f.vaultId,
          { kind: "join-ticket", device: f.b.record.id, purpose: "kit" },
          new Uint8Array([1]),
          f.options.now(),
        );
      else {
        const box = f.storage.openMailbox(f.vaultId, f.a.record.id, f.options.now())!;

        for (const [slot, length] of [
          ["KE1", 96],
          ["KE2", 320],
          ["KE3", 64],
          ["PairJoiner", 64],
        ] as const)
          f.storage.writeMailbox(
            f.vaultId,
            box.number,
            slot,
            p.randomBytes(length),
            f.options.now(),
          );

        f.storage.writeState(f.vaultId, [
          {
            kind: "server-identity",
            key: new Uint8Array([box.number >> 8, box.number & 255]),
            bytes: f.b.record.id,
          },
        ]);

        path += `?mailbox=${box.number}`;
      }

      expect((await f.send(swap, who, undefined, path)).status).toBe(200);
      expect(membership(f.storage, f.vaultId, f.b.record.id)).toEqual(f.b.record);
      expect(f.storage.device(f.vaultId, f.b.record.id)!.freshUntil).toBe(0);

      expect(f.storage.device(f.vaultId, f.b.record.id)!.unlockedUntil).toBeGreaterThan(
        f.options.now(),
      );

      if (op === 2)
        expect((await f.request("/v1/pairing/approver", undefined, f.b)).status).toBe(200);
      else
        expect(
          f.storage.session(
            f.vaultId,
            { kind: "join-ticket", device: f.b.record.id, purpose: "kit" },
            f.options.now(),
          ),
        ).toBeUndefined();
    } finally {
      f.close();
    }
  });
