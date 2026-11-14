import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const key = from(vector.key),
  keys = p.generateDeviceKeys(rng);

test("labels separate all signature roles", () => {
  const labels = ["entry", "manifest", "repair-report", "request", "server-hello", "sk-proof"];

  for (const label of labels) {
    const sig = p.Sign(key, label, key);
    expect(p.Verify(keys.objPub, label, key, sig).ok).toBe(true);

    for (const other of labels.filter((l) => l !== label))
      expect(p.Verify(keys.objPub, other, key, sig).ok).toBe(false);
  }

  expect(() => p.validateEdPublic(new Uint8Array(32))).toThrow();
  expect(p.Verify(new Uint8Array(32), "entry", key, new Uint8Array(64)).ok).toBe(false);
});

import { ed25519 } from "@noble/curves/ed25519.js";
import { sha512 } from "@noble/hashes/sha2.js";

test("noncanonical R passes ZIP215 but envden rejects it", () => {
  const publicKey = ed25519.Point.BASE.toBytes();
  const message = p.frame("entry", key);
  const r = new Uint8Array(32).fill(255);
  r[0] = 238;
  r[31] = 127;
  const digest = sha512(p.concat(r, publicKey, message));

  const challenge =
    BigInt("0x" + Buffer.from(digest).reverse().toString("hex")) % ed25519.Point.Fn.ORDER;

  const signature = p.concat(r, ed25519.Point.Fn.toBytes(challenge));
  expect(ed25519.verify(signature, message, publicKey, { zip215: true })).toBe(true);
  expect(p.Verify(publicKey, "entry", key, signature).ok).toBe(false);
});

test("box decryption failures carry a fixed EnvdenError and cause", () => {
  const box = p.sealBox(key, key, undefined, rng);

  try {
    p.openBox(new Uint8Array(32), box);
    throw new Error("decryption unexpectedly succeeded");
  } catch (error) {
    expect(error).toMatchObject({
      name: "EnvdenError",
      code: "INVALID_DATA",
      message: "Unable to decrypt box",
      cause: expect.any(Error),
    });
  }
});

test("verification preserves unexpected codec and input failures", () => {
  const failure = new Error("programmer failure");

  const codec: p.ICodec<Uint8Array> = {
    read: () => {
      throw failure;
    },
    write: () => {
      throw failure;
    },
  };

  expect(() =>
    p.verifyObject(codec, { body: key, signature: new Uint8Array(64) }, keys.objPub, "entry"),
  ).toThrow(failure);

  const publicKey = new Uint8Array(32);

  Object.defineProperty(publicKey, "length", {
    get: () => {
      throw failure;
    },
  });

  expect(() => p.Verify(publicKey, "entry", key, new Uint8Array(64))).toThrow(failure);
  expect(p.Verify(keys.objPub, "entry", key, new Uint8Array(63)).ok).toBe(false);
});
