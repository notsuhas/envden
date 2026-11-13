import { passwordRecord } from "./password.ts";
import * as p from "@envden/core/protocol";
import { applyEntry } from "@envden/core/chain";
import { createApp } from "../app.ts";
import { fixture, candidate, identity } from "./fixture.ts";
import { text } from "../http/encoding.ts";

export async function vaultFixture() {
  const keys = await identity();
  const f = fixture(keys);
  const a = f.member;
  const b = f.joiner;
  const recoveryKeys = p.generateRecoveryKeys();

  const recovery = {
    id: p.recoveryId(recoveryKeys),
    encPub: recoveryKeys.encPub,
    objPub: recoveryKeys.objPub,
  };

  const zero = new Uint8Array(32);

  const genesis = p.signObject(
    p.EntryCodec,
    {
      vaultId: zero,
      seq: 0n,
      parent: zero,
      kind: 0,
      payload: {
        serverPin: p.serverPin(keys.publicKey),
        device: a.record,
        recovery,
        vaultNonce: p.randomBytes(32),
        createdAt: 1n,
      },
      signer: a.record.id,
    },
    a.keys.objSk,
    "entry",
  );

  const vaultId = p.objectHash(p.EntryCodec, genesis, "entry");

  const epoch = p.signObject(
    p.EntryCodec,
    {
      vaultId,
      seq: 1n,
      parent: vaultId,
      kind: 3,
      payload: {
        change: {
          epoch: 1,
          keyCommit: p.randomBytes(32),
          wraps: [a.record, recovery]
            .map((d) => ({ recipient: d.id, enc: p.randomBytes(32), ct: p.randomBytes(48) }))
            .sort((x, y) => p.compare(x.recipient, y.recipient)),
        },
      },
      signer: a.record.id,
    },
    a.keys.objSk,
    "entry",
  );

  const keyring = p.randomBytes(64);
  const envelope = p.randomBytes(64);
  const files = { entries: [] };
  const sk = p.generateRecoveryKeys();

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      vaultId,
      seq: 1n,
      op: 0,
      prev: zero,
      listSeq: 1n,
      listHead: p.objectHash(p.EntryCodec, epoch, "entry"),
      epoch: 1,
      keyringHash: p.H("keyring-blob", keyring),
      filesHash: p.H("files", p.FilesCodec.write(files)),
      envelopeHash: p.H("envelope-blob", envelope),
      createdAt: 1n,
      signer: a.record.id,
    },
    a.keys.objSk,
    "manifest",
  );

  const record = await passwordRecord(keys.opaqueSetup, vaultId);

  const create: p.ISwap = {
    expectedHead: zero,
    entries: [genesis, epoch],
    header,
    files,
    keyring,
    envelope,
    skPub: sk.objPub,
    opaqueRecord: record,
    approver: undefined,
  };

  const options = { ...f.options, config: { appVersion: "1.0.0", minClient: "1.0.0" } };
  const app = createApp(options);
  const setup = p.tokenKey("setup", p.randomBytes(20));
  f.storage.setSetupToken(setup);

  f.storage.putSession(
    vaultId,
    { kind: "login", device: a.record.id, purpose: "registration-record" },
    record,
    options.now(),
  );

  f.storage.putSession(
    vaultId,
    { kind: "login", device: a.record.id, purpose: "registration-authority" },
    setup,
    options.now(),
  );

  let requestVault = vaultId;

  function request(
    path: string,
    body?: Uint8Array,
    who = a,
    proof?: (r: p.IRequest) => Uint8Array,
    method = body ? "POST" : "GET",
  ) {
    const r: p.IRequest = {
      vaultId: requestVault,
      serverPin: p.serverPin(keys.publicKey),
      method,
      pathAndQuery: path,
      bodyHash: p.sha256(body ?? new Uint8Array()),
      time: BigInt(options.now()),
      nonce: p.randomBytes(16),
      device: who.record.id,
      clientVersion: "1.0.0",
    };

    return app.request(path, {
      method,
      ...(body ? { body } : {}),
      headers: {
        "Envden-Request": text(p.RequestCodec.write(r)),
        "Envden-Device": text(r.device),
        "Envden-Body-Hash": text(r.bodyHash),
        "Envden-Time": String(r.time),
        "Envden-Nonce": text(r.nonce),
        "Envden-Signature": text(p.signRequest(r, who.keys.reqSk).signature),
        "Envden-Device-Record": text(p.DeviceRecordCodec.write(who.record)),
        ...(proof ? { "Envden-Proof": text(proof(r)) } : {}),
      },
    });
  }

  function next(
    previous: p.ISigned<p.IManifestHeader>,
    changes: Partial<p.IManifestHeader>,
    entries: p.ISigned<p.TEntry>[] = [],
    who = a,
  ): p.ISwap {
    return {
      expectedHead: p.objectHash(p.ManifestHeaderCodec, previous, "manifest"),
      entries,
      header: p.signObject(
        p.ManifestHeaderCodec,
        {
          ...previous.body,
          seq: previous.body.seq + 1n,
          prev: p.objectHash(p.ManifestHeaderCodec, previous, "manifest"),
          ...changes,
          signer: who.record.id,
        },
        who.keys.objSk,
        "manifest",
      ),
      files: undefined,
      keyring: undefined,
      envelope: undefined,
      skPub: undefined,
      opaqueRecord: undefined,
      approver: undefined,
    };
  }

  const initial = applyEntry(undefined, genesis);
  if (initial.kind !== "valid") throw new Error("Invalid fixture");
  const result = applyEntry(initial.state, epoch);
  if (result.kind !== "valid") throw new Error("Invalid fixture");

  return {
    ...f,
    setup,
    useVault: (id: Uint8Array) => {
      requestVault = id;
    },
    options,
    app,
    a,
    b,
    sk,
    recovery,
    recoveryKeys,
    vaultId,
    create,
    request,
    next,
    state: result.state,
    candidate,
    initialize: () =>
      request("/v1/vault", p.SwapCodec.write(create), a, (r) => p.tokenProof("setup", setup, r)),
    send: (swap: p.ISwap, who = a, proof?: (r: p.IRequest) => Uint8Array, path = "/v1/swap") =>
      request(path, p.SwapCodec.write(swap), who, proof),
  };
}
