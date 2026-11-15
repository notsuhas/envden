import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);
const key = from(vector.key);

test("pairing normalization and channel authentication", () => {
  expect(p.generatePairingCode(1, rng)).toBe(vector.pairingCode);
  expect(p.normalizePairingCode("1-ooil-0000")).toEqual({ mailbox: 1, password: "00110000" });

  for (const code of [
    "01-0000-0000",
    "0-0000-0000",
    "1000-0000-0000",
    "1-!!!!-0000",
    "12-ABCD-EFG",
    "999-0000-000",
    "12 ABCD EFG",
    "1-0000-00000",
  ])
    expect(() => p.normalizePairingCode(code)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT", message: "Codes look like 3-K7QF-2MXP" }),
    );

  for (const code of ["12-ABCD-EFGH", "12 ABCD EFGH", "12ABCDEFGH"])
    expect(p.normalizePairingCode(code)).toEqual({ mailbox: 12, password: "ABCDEFGH" });

  const channel = p.pairingChannelKeys(new Uint8Array(64));
  expect(channel.joinerToApprover).not.toEqual(channel.approverToJoiner);
  const box = p.sealBox(channel.joinerToApprover, key, undefined, rng);
  expect(p.openBox(channel.joinerToApprover, box)).toEqual(key);
  expect(() => p.openBox(channel.approverToJoiner, box)).toThrow();
});
