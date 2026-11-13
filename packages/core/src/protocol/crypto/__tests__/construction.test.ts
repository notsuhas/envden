import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const key = from(vector.key),
  keys = p.generateDeviceKeys(rng);

test("labels separate all signature roles", () => {
  const labels = [
    "entry",
    "manifest",
    "repair-report",
    "request",
    "server-hello",
    "release",
    "sk-proof",
  ];

  for (const label of labels) {
    const sig = p.Sign(key, label, key);
    expect(p.Verify(keys.objPub, label, key, sig).ok).toBe(true);

    for (const other of labels.filter((l) => l !== label))
      expect(p.Verify(keys.objPub, other, key, sig).ok).toBe(false);
  }

  expect(() => p.validateEdPublic(new Uint8Array(32))).toThrow();
  expect(p.Verify(new Uint8Array(32), "entry", key, new Uint8Array(64)).ok).toBe(false);
});
