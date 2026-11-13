import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const key = from(vector.key),
  vaultId = from(vector.vaultId),
  keys = p.generateDeviceKeys(rng);

test("HPKE fixed ephemeral and low order rejection", async () => {
  const wrap = await p.sealWrap(key, vaultId, 1, p.deviceId(keys), keys.encPub, rng);
  expect(hex(wrap.enc)).toBe(vector.wrap.enc);
  expect(hex(wrap.ct)).toBe(vector.wrap.ct);

  expect(
    await p.openWrap(wrap, keys.encSk, keys.encPub, vaultId, 1, p.keyCommit(key, vaultId, 1)),
  ).toEqual(key);

  expect(
    await p.sealWrap(key, vaultId, 1, p.deviceId(keys), new Uint8Array(32), rng).then(
      () => false,
      () => true,
    ),
  ).toBe(true);

  expect(
    await p.openWrap(wrap, keys.encSk, keys.encPub, vaultId, 1, new Uint8Array(32)).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
});

test("HPKE rejects a nonzero low-order X25519 recipient", async () => {
  const lowOrder = from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800");
  expect(p.sealWrap(key, vaultId, 1, p.deviceId(keys), lowOrder, rng)).rejects.toThrow();
});
