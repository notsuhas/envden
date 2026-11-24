import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";
import { membership } from "../vault/chain.ts";

for (const op of [2, 3])
  test(`op ${op} joins once with its grant or ticket and consumes it`, async () => {
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
        swap.approver = p.encode(p.JoinApprovedCodec, {
          vaultId: f.vaultId,
          serverPin: p.serverPin(f.options.serverKeys.publicKey),
          manifestHash: p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"),
        });

      const who = op === 2 ? f.a : f.b;
      expect((await f.send(swap, who)).status).toBe(401);
      let path = "/v1/swap";

      if (op === 3)
        f.storage.putSession(
          f.vaultId,
          { kind: "join-ticket", device: f.b.record.id, purpose: "recovery" },
          new Uint8Array([1]),
          f.options.now(),
        );
      else {
        const now = f.options.now();
        const record = p.encode(p.DeviceRecordCodec, f.b.record);
        const request = f.storage.openJoinRequest(f.b.record.id, record, p.randomBytes(32), now)!;
        const claim = { vault: f.vaultId, device: f.a.record.id };
        f.storage.writeJoinRequest(request.number, "offer", p.randomBytes(66), now, claim);

        expect(
          (await f.send(swap, who, undefined, `${path}?request=${request.number}`)).status,
        ).toBe(401);

        f.storage.writeJoinRequest(request.number, "reveal", p.randomBytes(200), now);
        path += `?request=${request.number}`;
      }

      expect((await f.send(swap, who, undefined, path)).status).toBe(200);
      expect(membership(f.storage, f.vaultId, f.b.record.id)).toEqual(f.b.record);

      if (op === 2) {
        expect(f.storage.joinRequests(f.options.now())).toEqual([]);
        const approved = await f.request("/v1/join-requests/approved", undefined, f.b);

        expect(p.MessageResponseSchema.parse(await approved.json()).message).toBe(
          Buffer.from(swap.approver!).toString("base64url"),
        );
      } else
        expect(
          f.storage.session(
            f.vaultId,
            { kind: "join-ticket", device: f.b.record.id, purpose: "recovery" },
            f.options.now(),
          ),
        ).toBeUndefined();
    } finally {
      f.close();
    }
  });
