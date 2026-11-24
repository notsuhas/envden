import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const key = from(vector.key),
  vaultId = from(vector.vaultId),
  code = from(vector.code),
  keys = p.generateDeviceKeys(rng);

const file = {
  repoId: "repo",
  path: "folder/.env",
  content: new TextEncoder().encode("SECRET=value\n"),
};

test("deterministic IDs, keys and token text", () => {
  expect(hex(p.deviceId(keys))).toBe(vector.deviceId);
  expect(hex(p.recoveryId(keys))).toBe(vector.recoveryId);
  expect(hex(p.serverPin(keys.objPub))).toBe(vector.serverPin);
  expect(hex(p.fileId(key, file.repoId, file.path))).toBe(vector.fileId);

  expect(p.encodeToken("setup", new Uint8Array(20).fill(7), p.serverPin(keys.objPub))).toBe(
    vector.setupToken,
  );

  expect(p.decodeToken("setup", vector.setupToken).secret.length).toBe(20);

  expect(
    p.isToken(
      "setup",
      ` ${vector.setupToken.slice(0, 40)}\n${vector.setupToken.slice(40).toLowerCase()} `,
    ),
  ).toBe(true);

  expect(() => p.decodeToken("repair", vector.setupToken)).toThrow();
});

test("proof derivation vectors", () => {
  const request = {
    serverPin: p.serverPin(keys.objPub),
    vaultId,
    method: "POST",
    pathAndQuery: "/swap",
    bodyHash: p.sha256(key),
    time: 1n,
    nonce: code,
    device: p.deviceId(keys),
    clientVersion: "1.0.0",
  };

  const token = new Uint8Array(20).fill(7);
  expect(hex(p.tokenProof("setup", p.tokenKey("setup", token), request))).toBe(vector.setupProof);

  expect(hex(p.tokenProof("repair", p.tokenKey("repair", token), request))).toBe(
    vector.repairProof,
  );

  expect(hex(p.signRecoveryProof(code, request))).toBe(vector.recoveryProof);

  expect(p.verifyRecoveryProof(p.proofPub(code), request, from(vector.recoveryProof)).ok).toBe(
    true,
  );

  expect(hex(p.H("repair-id", token))).toBe(vector.repairId);

  expect(hex(p.KDF(key, vaultId, "file-key", p.fileId(key, "repo", "folder/.env")))).toBe(
    vector.fileKey,
  );

  expect(hex(p.KDF(key, vaultId, "keyring-key", p.u32.write(1)))).toBe(vector.keyringKey);
});
