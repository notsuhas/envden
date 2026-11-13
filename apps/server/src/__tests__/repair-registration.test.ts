import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { vaultFixture } from "./vault-fixture.ts";
import { startRestored } from "../repair/start.ts";

test("repair enforces re-registration after password change and preserves SK refusal after kit change", async () => {
  const f = await vaultFixture();

  try {
    await f.initialize();
    const secret = p.decodeToken("repair", startRestored(f.options)[0]!.token).secret;
    const proof = (r: p.IRequest) => p.tokenProof("repair", p.tokenKey("repair", secret), r);
    const keys = p.generateRecoveryKeys();
    const recovery = { id: p.recoveryId(keys), encPub: keys.encPub, objPub: keys.objPub };

    const change = {
      epoch: 2,
      keyCommit: p.randomBytes(32),
      wraps: [f.a.record, recovery]
        .map((d) => ({ recipient: d.id, enc: p.randomBytes(32), ct: p.randomBytes(48) }))
        .sort((a, b) => p.compare(a.recipient, b.recipient)),
    };

    const entry = p.signObject(
      p.EntryCodec,
      {
        vaultId: f.vaultId,
        seq: 2n,
        parent: f.state.head,
        kind: 4,
        payload: { recovery, change },
        signer: f.a.record.id,
      },
      f.a.keys.objSk,
      "entry",
    );

    const envelope = p.randomBytes(64);
    const keyring = p.randomBytes(64);

    const kit = f.next(
      f.create.header,
      {
        op: 7,
        listSeq: 2n,
        listHead: p.objectHash(p.EntryCodec, entry, "entry"),
        epoch: 2,
        keyringHash: p.H("keyring-blob", keyring),
        envelopeHash: p.H("envelope-blob", envelope),
      },
      [entry],
    );

    kit.envelope = envelope;
    kit.keyring = keyring;
    kit.skPub = p.randomBytes(32);

    expect((await f.request("/v1/repair/history", p.SwapCodec.write(kit), f.a, proof)).status).toBe(
      200,
    );

    const changedEnvelope = p.randomBytes(64);

    const password = f.next(kit.header, {
      op: 8,
      envelopeHash: p.H("envelope-blob", changedEnvelope),
    });

    password.envelope = changedEnvelope;

    expect(
      (await f.request("/v1/repair/history", p.SwapCodec.write(password), f.a, proof)).status,
    ).toBe(200);

    const done = p.signObject(
      p.EntryCodec,
      {
        vaultId: f.vaultId,
        seq: 3n,
        parent: p.objectHash(p.EntryCodec, entry, "entry"),
        kind: 6,
        payload: {
          repairId: p.H("repair-id", secret),
          restoredHead: p.objectHash(p.ManifestHeaderCodec, f.create.header, "manifest"),
        },
        signer: f.a.record.id,
      },
      f.a.keys.objSk,
      "entry",
    );

    const close = f.next(
      password.header,
      { op: 12, listSeq: 3n, listHead: p.objectHash(p.EntryCodec, done, "entry") },
      [done],
    );

    expect((await f.send(close, f.a, proof)).status).toBe(400);
    const start = await p.opaqueStartRegistration("new password");
    const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

    const response = await f.request(
      "/v1/opaque/registration/start",
      json({ message: start.registrationRequest }),
      f.a,
      proof,
    );

    expect(response.status).toBe(200);
    const message = p.MessageResponseSchema.parse(await response.json()).message;

    const finish = await p.opaqueFinishRegistration({
      password: "new password",
      clientRegistrationState: start.clientRegistrationState,
      registrationResponse: message,
      identifiers: p.unlockIdentifiers(f.vaultId).identifiers,
    });

    close.opaqueRecord = Buffer.from(finish.registrationRecord, "base64url");

    expect(
      (
        await f.request(
          "/v1/repair/finish",
          json({
            kind: "registration",
            message: finish.registrationRecord,
            swap: Buffer.from(p.SwapCodec.write(close)).toString("base64url"),
          }),
          f.a,
          proof,
        )
      ).status,
    ).toBe(200);

    expect(f.storage.vault(f.vaultId)!.skRefused).toBe(true);

    expect(f.storage.state(f.vaultId, "opaqueRecord", new Uint8Array())).toEqual(
      close.opaqueRecord,
    );

    f.storage.putDevice(f.vaultId, f.a.record.id, {
      unlockedUntil: 0,
      freshUntil: 0,
      clientVersion: "1.0.0",
    });

    const skProof = (r: p.IRequest) => p.Sign(f.sk.objSk, "sk-proof", p.RequestCodec.write(r));
    expect((await f.request("/v1/envelope", undefined, f.a, skProof)).status).toBe(403);
  } finally {
    f.close();
  }
});
