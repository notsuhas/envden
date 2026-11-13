import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const vaultId = from(vector.vaultId),
  secret = from(vector.secret);

test("envelope fixed salt/nonce and wrong password or secret", async () => {
  const box = from(vector.envelopeBox),
    value = await p.openEnvelope(box, "password", secret, vaultId);

  expect(value.vaultId).toEqual(vaultId);
  expect(hex(await p.sealEnvelope(value, "password", secret, rng))).toBe(vector.envelopeBox);

  expect(
    await p.openEnvelope(box, "wrong", secret, vaultId).then(
      () => false,
      () => true,
    ),
  ).toBe(true);

  expect(
    await p.openEnvelope(box, "password", new Uint8Array(16), vaultId).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
});

test("envelope key derivation vector", async () => {
  const pw = await p.passwordKey("password", secret);
  expect(hex(p.KDF(p.concat(pw, secret), vaultId, "envelope-key"))).toBe(vector.envelopeKey);
});
