import { expect, test } from "bun:test";
import { Sign, ReleaseCodec, ReleaseFeedCodec } from "@envden/core/protocol";
import { checkBuilds, nextSequence, verifiedFeed } from "../feed-policy.ts";

const seed = new Uint8Array(
  Buffer.from("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "hex"),
);

const publicKey = new Uint8Array(
  Buffer.from("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "hex"),
);

const trust = { generation: 1, keys: { primary: publicKey, backup: publicKey } };

const body = {
  generation: 1,
  seq: 7n,
  issuedAt: 1n,
  expires: 2592000001n,
  latest: "0.1.0",
  unsafe: [],
  builds: [{ platform: "linux-x64", sha256: new Uint8Array(32) }],
  revokePrimary: 0,
  next: undefined,
};

function feed(value = body) {
  return ReleaseFeedCodec.write({
    body: value,
    signatures: [{ key: 0, sig: Sign(seed, "release", ReleaseCodec.write(value)) }],
  });
}

test("published seq wins even in first-release mode", () => {
  expect(nextSequence([verifiedFeed(feed(), trust), { ...body, seq: 2n }], true)).toBe(8n);
  expect(nextSequence([], true)).toBe(1n);
  expect(() => nextSequence([], false)).toThrow("Published feed required");
});

test("tag feeds prevent rebuilding an existing version with different bytes", () => {
  expect(() =>
    checkBuilds("0.1.0", [{ platform: "linux-x64", sha256: new Uint8Array(32).fill(1) }], [body]),
  ).toThrow("changed release assets");

  expect(() => checkBuilds("0.1.0", [], [body])).toThrow();
  expect(() => checkBuilds("0.1.1", [], [body])).not.toThrow();
});

test("verification uses pinned trust and refuses rotation or revoked primary", () => {
  expect(() =>
    verifiedFeed(feed(), { ...trust, keys: { ...trust.keys, primary: new Uint8Array(32) } }),
  ).toThrow();

  expect(() => verifiedFeed(feed({ ...body, revokePrimary: 1 }), trust)).toThrow("Offline backup");
});
