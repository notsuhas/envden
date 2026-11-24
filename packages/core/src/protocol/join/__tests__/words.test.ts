import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";
import wordlist from "../bip39-english.json" with { type: "json" };

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);
const keys = p.generateDeviceKeys(rng);
const pin = p.serverPin(keys.objPub);

function record(source: ReturnType<typeof p.generateDeviceKeys>, name = "test") {
  return {
    id: p.deviceId(source),
    name,
    encPub: source.encPub,
    objPub: source.objPub,
    reqPub: source.reqPub,
  };
}

const device = record(keys);
const other = record(p.generateDeviceKeys());

const transcript = {
  vaultId: from(vector.vaultId),
  pin,
  device,
  joinerNonce: from(vector.key),
  approverNonce: from(vector.vaultId),
};

test("vendored wordlist is the BIP-39 English list", () => {
  const text = `${wordlist.join("\n")}\n`;

  expect(wordlist.length).toBe(2048);
  expect(new Set(wordlist).size).toBe(2048);

  expect(Buffer.from(p.sha256(new TextEncoder().encode(text))).toString("hex")).toBe(
    "2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda",
  );
});

test("both sides derive the same three words from the same transcript", () => {
  expect(p.joinWords(transcript)).toEqual(vector.joinWords);
  expect(p.joinWords({ ...transcript })).toEqual(p.joinWords(transcript));
});

test("changing the keys, name, either nonce, the vault or the pin changes the words", () => {
  for (const changed of [
    { device: other },
    { device: { ...device, name: "tests" } },
    { joinerNonce: rng(32).reverse() },
    { approverNonce: from(vector.key) },
    { vaultId: new Uint8Array(32).fill(9) },
    { pin: new Uint8Array(32) },
  ])
    expect(p.joinWords({ ...transcript, ...changed })).not.toEqual(vector.joinWords);
});

test("a reveal opens the commit only with the committed record and nonce", () => {
  const commit = p.joinCommit(pin, device, transcript.joinerNonce);

  expect(Buffer.from(commit).toString("hex")).toBe(vector.joinCommit);
  expect(p.opensCommit(commit, pin, device, transcript.joinerNonce)).toBe(true);

  for (const [revealed, nonce, server] of [
    [other, transcript.joinerNonce, pin],
    [{ ...device, name: "renamed" }, transcript.joinerNonce, pin],
    [device, rng(32).reverse(), pin],
    [device, transcript.joinerNonce, new Uint8Array(32)],
  ] as const)
    expect(p.opensCommit(commit, server, revealed, nonce)).toBe(false);
});

test("join messages round-trip and reject other tags", () => {
  const offer = { vaultId: transcript.vaultId, nonce: transcript.approverNonce };
  const reveal = { device, nonce: transcript.joinerNonce };

  expect(p.decode(p.JoinOfferCodec, p.encode(p.JoinOfferCodec, offer))).toEqual(offer);
  expect(p.decode(p.JoinRevealCodec, p.encode(p.JoinRevealCodec, reveal))).toEqual(reveal);
  expect(() => p.decode(p.JoinRevealCodec, p.encode(p.JoinOfferCodec, offer))).toThrow();
});
