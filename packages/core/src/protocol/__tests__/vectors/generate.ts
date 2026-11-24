import * as p from "../../index.ts";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const key = rng(32),
  vaultId = new Uint8Array(32).fill(3),
  code = rng(16);

const keys = p.generateDeviceKeys(rng),
  recovery = p.generateRecoveryKeys(rng);

const device = {
  id: p.deviceId(keys),
  name: "test",
  encPub: keys.encPub,
  objPub: keys.objPub,
  reqPub: keys.reqPub,
};

const context = { vaultId, epoch: 1, fileId: p.fileId(key, "repo", "folder/.env"), version: 1n };

const file = {
  repoId: "repo",
  path: "folder/.env",
  content: new TextEncoder().encode("SECRET=value\n"),
};

const name = { repoId: file.repoId, path: file.path };
const fileBox = p.sealFile(file, key, context, rng);

const envelope = {
  vaultId,
  recoveryEncSk: recovery.encSk,
  recoveryObjSk: recovery.objSk,
  checkpoint: new Uint8Array(32),
  sealedAt: 1n,
};

const envelopeBox = p.sealEnvelope(envelope, code, rng);
const wrap = await p.sealWrap(key, vaultId, 1, device.id, device.encPub, rng);
const keyringBox = p.sealKeyring({ vaultId, epoch: 1, idKey: key, older: [] }, key, rng);

const request = {
  serverPin: p.serverPin(keys.objPub),
  vaultId,
  method: "POST",
  pathAndQuery: "/swap",
  bodyHash: p.sha256(key),
  time: 1n,
  nonce: code,
  device: device.id,
  clientVersion: "1.0.0",
};

const output = {
  key: hex(key),
  vaultId: hex(vaultId),
  code: hex(code),
  deviceId: hex(device.id),
  recoveryId: hex(p.recoveryId(recovery)),
  serverPin: hex(p.serverPin(keys.objPub)),
  fileId: hex(context.fileId),
  fileBox: hex(fileBox),
  fileNameBox: hex(p.sealFileName(name, key, context, rng)),
  keyringBox: hex(keyringBox),
  envelopeBox: hex(envelopeBox),
  wrap: { recipient: hex(wrap.recipient), enc: hex(wrap.enc), ct: hex(wrap.ct) },
  proofPub: hex(p.proofPub(code)),
  recoveryText: p.encodeRecoveryCode(code),
  setupToken: p.encodeToken("setup", new Uint8Array(20).fill(7), p.serverPin(keys.objPub)),
  joinCommit: hex(p.joinCommit(p.serverPin(keys.objPub), device, key)),
  joinWords: p.joinWords({
    vaultId,
    pin: p.serverPin(keys.objPub),
    device,
    joinerNonce: key,
    approverNonce: vaultId,
  }),
  fileKey: hex(p.KDF(key, vaultId, "file-key", context.fileId)),
  keyringKey: hex(p.KDF(key, vaultId, "keyring-key", p.u32.write(1))),
  envelopeKey: hex(p.envelopeKey(code, vaultId)),
  setupProof: hex(p.tokenProof("setup", p.tokenKey("setup", new Uint8Array(20).fill(7)), request)),
  repairProof: hex(
    p.tokenProof("repair", p.tokenKey("repair", new Uint8Array(20).fill(7)), request),
  ),
  recoveryProof: hex(p.signRecoveryProof(code, request)),
  repairId: hex(p.H("repair-id", new Uint8Array(20).fill(7))),
  signature: hex(p.Sign(key, "entry", key)),
  edPublic: hex(ed25519.getPublicKey(key)),
  xPublic: hex(x25519.getPublicKey(key)),
};

await Bun.write(
  new URL("./protocol.json", import.meta.url),
  JSON.stringify(output, null, 2) + "\n",
);
