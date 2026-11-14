import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import { ed25519 } from "@noble/curves/ed25519.js";

const primary = new Uint8Array(32).fill(1),
  backup = new Uint8Array(32).fill(2),
  keys = { primary: ed25519.getPublicKey(primary), backup: ed25519.getPublicKey(backup) };

const base: p.IRelease = {
  generation: 1,
  seq: 1n,
  issuedAt: 0n,
  expires: 2592000000n,
  latest: "1.1.0",
  unsafe: [],
  builds: [{ platform: "test", sha256: p.sha256(new Uint8Array()) }],
  revokePrimary: 0,
  next: undefined,
};

function feed(body: p.IRelease, signers = [0]) {
  return p.encode(p.ReleaseFeedCodec, {
    body,
    signatures: signers.map((key) => ({
      key,
      sig: p.Sign(key === 0 ? primary : backup, "release", p.encode(p.ReleaseCodec, body)),
    })),
  });
}

function accept(
  data: Uint8Array,
  state = p.initialReleaseState({ generation: 1, keys }),
  now = 0n,
) {
  const result = p.acceptRelease(data, state, now);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.reason);

  return result.value;
}

test("release replay requires byte equality per key", () => {
  const bytes = feed(base),
    a = accept(bytes);

  expect(accept(bytes, a.state).state.primary?.seq).toBe(1n);
  expect(p.acceptRelease(feed({ ...base, latest: "1.2.0" }), a.state, 0n).ok).toBe(false);
  expect(p.acceptRelease(feed({ ...base, seq: 0n }), a.state, 0n).ok).toBe(false);
  expect(p.acceptRelease(feed({ ...base, generation: 2 }), a.state, 0n).ok).toBe(false);
});

test("backup bypasses huge primary sequence and can revoke permanently", () => {
  const a = accept(feed({ ...base, seq: 99999999999n }));
  const b = accept(feed({ ...base, revokePrimary: 1 }, [1]), a.state);
  expect(b.state.primaryRevoked).toBe(true);
  expect(b.state.primary?.seq).toBe(99999999999n);
  expect(p.acceptRelease(feed({ ...base, seq: 100000000000n }), b.state, 0n).ok).toBe(false);
  expect(accept(feed({ ...base, seq: 2n }, [1]), b.state).state.backup?.seq).toBe(2n);
});

test("dual signature max and stripped signature equality", () => {
  const a = accept(feed({ ...base, seq: 100n }));

  const bytes = feed(base, [0, 1]),
    b = accept(bytes, a.state);

  expect(b.state.primary?.seq).toBe(100n);
  expect(b.state.backup?.seq).toBe(1n);
  expect(accept(bytes, b.state).state.backup?.seq).toBe(1n);
  expect(p.acceptRelease(feed(base, [1]), b.state, 0n).ok).toBe(false);
});

test("backup controls rotation and revocation, even when expired", () => {
  const next = { primary: keys.backup, backup: keys.primary };

  const a = accept(
    feed({ ...base, next, revokePrimary: 1, unsafe: ["1.0.0"] }),
    undefined,
    3000000000n,
  );

  expect(a.expired).toBe(true);
  expect(a.state.generation).toBe(1);
  expect(a.state.primaryRevoked).toBe(false);

  const b = accept(
    feed({ ...base, next, revokePrimary: 1, unsafe: ["1.0.0"] }, [1]),
    undefined,
    3000000000n,
  );

  expect(b.state.generation).toBe(2);
  expect(b.state.unsafe).toEqual(["1.0.0"]);
  expect(b.state.primaryRevoked).toBe(false);
  expect(b.state.primary).toBeUndefined();
});

test("built-in generation wins ties and stored higher generation wins", () => {
  const stored = {
    ...p.initialReleaseState({ generation: 1, keys }),
    keys: { primary: keys.backup, backup: keys.primary },
  };

  expect(p.initialReleaseState({ generation: 1, keys }, stored).keys).toEqual(keys);
  expect(p.initialReleaseState({ generation: 0, keys }, stored).keys).toEqual(stored.keys);
});

test("invalid signature, key tags, revocation flags, expiry and order rejected", () => {
  const bad = feed(base);
  bad[bad.length - 1] = bad[bad.length - 1]! ^ 1;
  expect(p.acceptRelease(bad, p.initialReleaseState({ generation: 1, keys }), 0n).ok).toBe(false);

  for (const body of [
    { ...base, revokePrimary: 2 },
    { ...base, expires: 10n },
    { ...base, unsafe: ["2.0.0", "1.0.0"] },
    { ...base, builds: [base.builds[0]!, base.builds[0]!] },
  ])
    expect(() => feed(body)).toThrow();

  expect(() => feed(base, [2])).toThrow();
  expect(() => feed(base, [1, 0])).toThrow();
  expect(() => feed(base, [0, 0])).toThrow();
});

test("self update requires newer safe unexpired authenticated build", () => {
  expect(p.selfUpdateDecision(base, "1.0.0", "test", [], 0n, new Uint8Array()).ok).toBe(true);

  for (const [running, platform, unsafe, now, download] of [
    ["1.1.0", "test", [], 0n, new Uint8Array()],
    ["1.0.0", "other", [], 0n, new Uint8Array()],
    ["1.0.0", "test", ["1.1.0"], 0n, new Uint8Array()],
    ["1.0.0", "test", [], base.expires, new Uint8Array()],
    ["1.0.0", "test", [], 0n, new Uint8Array(1)],
  ] satisfies [string, string, string[], bigint, Uint8Array][]) {
    expect(p.selfUpdateDecision(base, running, platform, unsafe, now, download).ok).toBe(false);
  }
});

test("every listed release signature must verify and wire signatures must be ordered", () => {
  const good = feed(base, [0, 1]);
  const junk = good.slice();
  junk[junk.length - 1] = junk[junk.length - 1]! ^ 1;
  const state = p.initialReleaseState({ generation: 1, keys });
  expect(p.acceptRelease(junk, state, 0n).ok).toBe(false);
  const reversed = p.concat(good.subarray(0, -130), good.subarray(-65), good.subarray(-130, -65));
  expect(p.acceptRelease(reversed, state, 0n).ok).toBe(false);
});

test("release codec rejects unknown and duplicate wire signature keys", () => {
  const body = p.encode(p.ReleaseCodec, base);
  const signature = new Uint8Array(64);

  for (const tags of [[2], [255], [0, 0], [1, 1]]) {
    const wire = p.concat(
      body,
      p.u32.write(tags.length),
      ...tags.map((key) => p.concat(p.u8.write(key), signature)),
    );

    expect(() => p.decodeReleaseFeed(wire)).toThrow();
  }
});
