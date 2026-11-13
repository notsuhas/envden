import * as p from "../../index.ts";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const key = rng(32),
  vaultId = new Uint8Array(32).fill(3),
  secret = rng(16);

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

const envelopeBox = await p.sealEnvelope(envelope, "password", secret, rng);
const wrap = await p.sealWrap(key, vaultId, 1, device.id, device.encPub, rng);
const keyringBox = p.sealKeyring({ vaultId, epoch: 1, idKey: key, older: [] }, key, rng);

const request = {
  serverPin: p.serverPin(keys.objPub),
  vaultId,
  method: "POST",
  pathAndQuery: "/swap",
  bodyHash: p.sha256(key),
  time: 1n,
  nonce: secret,
  device: device.id,
  clientVersion: "1.0.0",
};

const output = {
  key: hex(key),
  vaultId: hex(vaultId),
  secret: hex(secret),
  deviceId: hex(device.id),
  recoveryId: hex(p.recoveryId(recovery)),
  serverPin: hex(p.serverPin(keys.objPub)),
  fileId: hex(context.fileId),
  fileBox: hex(fileBox),
  fileNameBox: hex(p.sealFileName(name, key, context, rng)),
  keyringBox: hex(keyringBox),
  envelopeBox: hex(envelopeBox),
  wrap: { recipient: hex(wrap.recipient), enc: hex(wrap.enc), ct: hex(wrap.ct) },
  skPub: hex(p.skPub(secret, vaultId)),
  secretText: p.encodeSecretKey(secret),
  setupToken: p.encodeToken("setup", new Uint8Array(20).fill(7), p.serverPin(keys.objPub)),
  pairingCode: p.generatePairingCode(1, rng),
  fileKey: hex(p.KDF(key, vaultId, "file-key", context.fileId)),
  keyringKey: hex(p.KDF(key, vaultId, "keyring-key", p.u32.write(1))),
  envelopeKey: hex(
    p.KDF(p.concat(await p.passwordKey("password", secret), secret), vaultId, "envelope-key"),
  ),
  setupProof: hex(p.tokenProof("setup", p.tokenKey("setup", new Uint8Array(20).fill(7)), request)),
  repairProof: hex(
    p.tokenProof("repair", p.tokenKey("repair", new Uint8Array(20).fill(7)), request),
  ),
  skProof: hex(p.signSKProof(secret, vaultId, request)),
  repairId: hex(p.H("repair-id", new Uint8Array(20).fill(7))),
  signature: hex(p.Sign(key, "entry", key)),
  edPublic: hex(ed25519.getPublicKey(key)),
  xPublic: hex(x25519.getPublicKey(key)),
};

await Bun.write(
  new URL("./protocol.json", import.meta.url),
  JSON.stringify(output, null, 2) + "\n",
);

for (const [filename, password, ids] of [
  ["opaque.json", "password", p.unlockIdentifiers(vaultId)],
  ["pairing.json", "01234567", p.pairingIdentifiers(p.serverPin(keys.objPub), 1)],
] satisfies [string, string, ReturnType<typeof p.unlockIdentifiers>][]) {
  const setup = await p.opaqueCreateSetup(),
    a = await p.opaqueStartRegistration(password),
    b = await p.opaqueRegistrationResponse({
      serverSetup: setup,
      userIdentifier: ids.userIdentifier,
      registrationRequest: a.registrationRequest,
    }),
    c = await p.opaqueFinishRegistration({
      password: password,
      ...b,
      clientRegistrationState: a.clientRegistrationState,
      identifiers: ids.identifiers,
    }),
    d = await p.opaqueStartLogin(password),
    e = await p.opaqueServerStartLogin({
      serverSetup: setup,
      registrationRecord: c.registrationRecord,
      startLoginRequest: d.startLoginRequest,
      ...ids,
    });
  const f = await p.opaqueFinishLogin({
    password: password,
    clientLoginState: d.clientLoginState,
    loginResponse: e.loginResponse,
    identifiers: ids.identifiers,
  });
  await Bun.write(
    new URL("./" + filename, import.meta.url),
    JSON.stringify(
      { ids, registration: { serverSetup: setup, ...a, ...b, ...c }, login: { ...d, ...e, ...f } },
      null,
      2,
    ) + "\n",
  );
}
