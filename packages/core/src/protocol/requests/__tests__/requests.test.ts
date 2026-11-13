import { test, expect } from "bun:test";
import * as p from "../../index.ts";

const key = new Uint8Array(32).fill(1),
  keys = p.generateDeviceKeys((n) => new Uint8Array(n).fill(1)),
  pin = p.serverPin(keys.objPub),
  z = new Uint8Array(32);

const request = {
  serverPin: pin,
  vaultId: z,
  method: "POST",
  pathAndQuery: "/swap?a=1",
  bodyHash: p.sha256(z),
  time: 1000000n,
  nonce: new Uint8Array(16),
  device: p.deviceId(keys),
  clientVersion: "1.0.0",
};

test("request signature, time, nonce and body bindings", () => {
  const signed = p.signRequest(request, key);
  expect(p.verifyRequest(signed, keys.reqPub, pin, z, 1000000n, false).ok).toBe(true);
  expect(p.verifyRequest(signed, keys.reqPub, pin, z, 1300001n, false).ok).toBe(false);
  expect(p.verifyRequest(signed, keys.reqPub, pin, z, 1000000n, true).ok).toBe(false);
  expect(p.verifyRequest(signed, keys.reqPub, z, z, 1000000n, false).ok).toBe(false);

  expect(p.verifyRequest(signed, keys.reqPub, pin, new Uint8Array(), 1000000n, false).ok).toBe(
    false,
  );

  expect(p.requestTimeValid(700000n, 1000000n)).toBe(true);
  expect(p.nonceStillLive(400000n, 1000000n)).toBe(false);
});

test("hello challenge, pin, host, version and signature", () => {
  const hello = p.buildHello(
    {
      challenge: z,
      host: "server",
      serverSignPub: keys.objPub,
      appVersion: "1.0.0",
      minClient: "1.0.0",
      protocols: [1],
    },
    key,
  );

  expect(p.verifyHello(hello, z, "SERVER", pin, "1.0.0").ok).toBe(true);
  expect(p.verifyHello(hello, z, "other", pin, "1.0.0").ok).toBe(false);
  expect(p.verifyHello(hello, z, "server", pin, "1.0.1").ok).toBe(false);
  expect(p.verifyHello(hello, z, "server", z, "1.0.0").ok).toBe(false);
});

test("setup, repair and SK proofs cannot cross roles", () => {
  const secret = new Uint8Array(20).fill(3),
    setup = p.tokenKey("setup", secret),
    repair = p.tokenKey("repair", secret);

  expect(setup).not.toEqual(repair);
  const proof = p.tokenProof("setup", setup, request);
  expect(p.verifyTokenProof("setup", setup, request, proof).ok).toBe(true);
  expect(p.verifyTokenProof("repair", repair, request, proof).ok).toBe(false);

  const sk = new Uint8Array(16),
    signature = p.signSKProof(sk, z, request);

  expect(p.verifySKProof(p.skPub(sk, z), request, signature).ok).toBe(true);

  expect(p.Verify(p.skPub(sk, z), "request", p.encode(p.RequestCodec, request), signature).ok).toBe(
    false,
  );
});
