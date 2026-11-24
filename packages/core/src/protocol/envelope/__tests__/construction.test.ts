import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const vaultId = from(vector.vaultId),
  code = from(vector.code);

test("envelope opens and reseals at a fixed nonce, and only with its code and vault", () => {
  const box = from(vector.envelopeBox),
    value = p.openEnvelope(box, code, vaultId);

  expect(value.vaultId).toEqual(vaultId);
  expect(hex(p.sealEnvelope(value, code, rng))).toBe(vector.envelopeBox);

  for (const [wrongCode, wrongVault] of [
    [new Uint8Array(16), vaultId],
    [code, new Uint8Array(32).fill(4)],
  ] as const)
    expect(() => p.openEnvelope(box, wrongCode, wrongVault)).toThrow(
      expect.objectContaining({ name: "EnvdenError", code: "INVALID_DATA" }),
    );
});

test("envelope key derives from the code with the vault ID as salt", () => {
  expect(hex(p.envelopeKey(code, vaultId))).toBe(vector.envelopeKey);

  expect(hex(p.KDF(code, vaultId, "recovery-envelope-key"))).toBe(vector.envelopeKey);
  expect(hex(p.envelopeKey(code, new Uint8Array(32)))).not.toBe(vector.envelopeKey);
});
