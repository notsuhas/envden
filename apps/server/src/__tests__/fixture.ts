import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { createAdapters } from "../adapters.ts";
import { createApp } from "../app.ts";
import { createBodyBudget } from "../middleware/body-budget.ts";
import { text } from "../http/encoding.ts";
import type { IServerKeys } from "../http/types.ts";

const founding = candidate();
const recoveryKeys = p.generateRecoveryKeys();

const genesis = p.signObject<p.TEntry>(
  p.EntryCodec,
  {
    vaultId: new Uint8Array(32),
    seq: 0n,
    parent: new Uint8Array(32),
    kind: 0,
    payload: {
      serverPin: new Uint8Array(32).fill(1),
      device: founding.record,
      recovery: {
        id: p.recoveryId(recoveryKeys),
        encPub: recoveryKeys.encPub,
        objPub: recoveryKeys.objPub,
      },
      vaultNonce: p.randomBytes(32),
      createdAt: 1n,
    },
    signer: founding.record.id,
  },
  founding.keys.objSk,
  "entry",
);

export const vaultId = p.objectHash(p.EntryCodec, genesis, "entry");

export function identity(): IServerKeys {
  const keys = p.generateRecoveryKeys();

  return { secretKey: keys.objSk, publicKey: keys.objPub };
}

export function candidate(name = "device") {
  const keys = p.generateDeviceKeys();

  const record = {
    id: p.deviceId(keys),
    name,
    encPub: keys.encPub,
    objPub: keys.objPub,
    reqPub: keys.reqPub,
  };

  return { keys, record };
}

export function fixture(serverKeys: IServerKeys, reserveBody = createBodyBudget()) {
  const dir = mkdtempSync(join(tmpdir(), "envden-server-"));
  const { storage } = createAdapters(dir, 1000000);
  const member = founding;
  const joiner = candidate("joiner");
  let time = 1000000;

  const options = {
    storage,
    now: () => time,
    serverKeys,
    config: {
      appVersion: "1.0.0",
      minClient: "1.0.0",
    },
  };

  storage.configureVault(vaultId, { active: true, frozen: false, proofRefused: false });

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      vaultId,
      seq: 1n,
      prev: new Uint8Array(32),
      listHead: vaultId,
      listSeq: 0n,
      epoch: 0,
      op: 0,
      filesHash: p.H("files", p.FilesCodec.write({ entries: [] })),
      keyringHash: new Uint8Array(32),
      envelopeHash: new Uint8Array(32),
      createdAt: 1n,
      signer: member.record.id,
    },
    member.keys.objSk,
    "manifest",
  );

  storage.commitSwap(
    vaultId,
    undefined,
    {
      header: {
        hash: p.objectHash(p.ManifestHeaderCodec, header, "manifest"),
        seq: 1n,
        bytes: p.signedCodec(p.ManifestHeaderCodec).write(header),
      },
      entries: [{ hash: vaultId, seq: 0n, bytes: p.signedCodec(p.EntryCodec).write(genesis) }],
      bodyDigest: p.randomBytes(32),
    },
    time,
  );

  storage.putDevice(vaultId, member.record.id, { clientVersion: "1.0.0" });

  const app = createApp(options, reserveBody);

  function request(
    path: string,
    body?: unknown,
    settings: {
      who?: typeof member;
      method?: string;
      mutate?: (r: p.IRequest) => void;
      headers?: Record<string, string>;
      proof?: (r: p.IRequest) => Uint8Array;
    } = {},
  ) {
    const who = settings.who ?? member;
    const method = settings.method ?? (body === undefined ? "GET" : "POST");
    const serialized = body === undefined ? "" : JSON.stringify(body);

    const r: p.IRequest = {
      serverPin: p.serverPin(serverKeys.publicKey),
      vaultId,
      method,
      pathAndQuery: path,
      bodyHash: p.sha256(new TextEncoder().encode(serialized)),
      time: BigInt(time),
      nonce: p.randomBytes(16),
      device: who.record.id,
      clientVersion: "1.0.0",
    };

    settings.mutate?.(r);

    const headers = {
      "Content-Type": "application/json",
      "Envden-Request": text(p.encode(p.RequestCodec, r)),
      "Envden-Device": text(r.device),
      "Envden-Body-Hash": text(r.bodyHash),
      "Envden-Time": String(r.time),
      "Envden-Nonce": text(r.nonce),
      "Envden-Signature": text(p.signRequest(r, who.keys.reqSk).signature),
      "Envden-Device-Record": text(p.encode(p.DeviceRecordCodec, who.record)),
      ...(settings.proof ? { "Envden-Proof": text(settings.proof(r)) } : {}),
      ...settings.headers,
    };

    return {
      send: () =>
        app.request(path, { method, headers, ...(serialized ? { body: serialized } : {}) }),
      r,
      headers,
    };
  }

  return {
    app,
    reserveBody,
    options,
    storage,
    member,
    joiner,
    request,
    advance: (ms: number) => {
      time += ms;
    },
    close: () => {
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
