import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const key = from(vector.key),
  vaultId = from(vector.vaultId);

test("keyring vector and commit checks", () => {
  const value = { vaultId, epoch: 1, idKey: key, older: [] };
  expect(hex(p.sealKeyring(value, key, rng))).toBe(vector.keyringBox);
  const commits = new Map([[1, p.keyCommit(key, vaultId, 1)]]);
  expect(p.openKeyring(from(vector.keyringBox), key, vaultId, 1, commits, key)).toEqual(value);
  expect(() => p.openKeyring(from(vector.keyringBox), key, vaultId, 1, new Map())).toThrow();

  expect(() =>
    p.openKeyring(from(vector.keyringBox), key, vaultId, 1, commits, new Uint8Array(32)),
  ).toThrow();
});
