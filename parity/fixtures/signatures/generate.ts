import { ed25519, ED25519_TORSION_SUBGROUP } from "@noble/curves/ed25519.js";
import { Verify, frame } from "@envden/core/protocol";
import { createHash } from "node:crypto";

const message = new TextEncoder().encode("review2");
const order = ed25519.Point.Fn.ORDER;

const littleEndian = (bytes: Uint8Array) =>
  BigInt(`0x${Buffer.from(bytes).reverse().toString("hex")}`);

function scalar(value: bigint) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++, value >>= 8n) bytes[i] = Number(value & 255n);

  return bytes;
}

const identity = ed25519.Point.ZERO.toBytes();
const orderTwo = scalar((1n << 255n) - 20n);
const noncanonical = scalar((1n << 255n) - 18n);
const negativeZero = identity.slice();

negativeZero[31] = 128;

const base = ed25519.Point.BASE.toBytes();

function signature(publicKey: Uint8Array, r: Uint8Array, nonce: bigint) {
  const digest = createHash("sha512")
    .update(r)
    .update(publicKey)
    .update(frame("request", message))
    .digest();

  return new Uint8Array([...r, ...scalar((nonce + littleEndian(digest)) % order)]);
}

const mixed = ed25519.Point.BASE.add(ed25519.Point.fromBytes(orderTwo)).toBytes();

const cases = [
  ["identity R", base, signature(base, identity, 0n)],
  ["mixed order A", mixed, signature(mixed, base, 1n)],
  ["order two R", base, signature(base, orderTwo, 0n)],
  ["noncanonical R", base, signature(base, noncanonical, 0n)],
  ["negative zero R", base, signature(base, negativeZero, 0n)],
  ["noncanonical A", noncanonical, signature(noncanonical, identity, 0n)],
  ["negative zero A", negativeZero, signature(negativeZero, identity, 0n)],
  ["small order A", identity, new Uint8Array([...identity, ...scalar(0n)])],
  ["S equals L", base, new Uint8Array([...identity, ...scalar(order)])],
  ["S exceeds L", base, new Uint8Array([...identity, ...scalar(order + 1n)])],
  [
    "valid",
    ed25519.getPublicKey(new Uint8Array(32).fill(7)),
    ed25519.sign(frame("request", message), new Uint8Array(32).fill(7)),
  ],
  ["wrong equation", base, new Uint8Array([...base, ...scalar(1n)])],
] as const;

const torsionCases = ED25519_TORSION_SUBGROUP.flatMap((encoded, index) => {
  const point = ed25519.Point.fromHex(encoded);
  const r = point.toBytes();
  const publicKey = ed25519.Point.BASE.add(point).toBytes();

  return [
    [`torsion R ${index}`, base, signature(base, r, 0n)],
    [`mixed A ${index}`, publicKey, signature(publicKey, base, 1n)],
  ] as const;
});

const fixtures = [...cases, ...torsionCases].map(([name, publicKey, sig]) => ({
  name,
  public: Buffer.from(publicKey).toString("hex"),
  signature: Buffer.from(sig).toString("hex"),
  message: Buffer.from(message).toString("hex"),
  expected: Verify(publicKey, "request", message, sig).ok,
}));

await Bun.write(new URL("vectors.json", import.meta.url), JSON.stringify(fixtures, null, 2) + "\n");

console.log(fixtures.map(({ name, expected }) => ({ name, expected })));
