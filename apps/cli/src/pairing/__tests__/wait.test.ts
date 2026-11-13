import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { createClient } from "../../client/request.ts";
import { waitMessage, pairingResponse } from "../wait.ts";

test("mailbox waiting accepts pending replies and expires using the supplied clock", async () => {
  const keys = p.generateDeviceKeys();

  const identity = {
    keys,
    record: {
      id: p.deviceId(keys),
      name: "test",
      encPub: keys.encPub,
      objPub: keys.objPub,
      reqPub: keys.reqPub,
    },
  };

  let time = 0;
  let requests = 0;

  const client = createClient({
    address: "http://server.test",
    pin: new Uint8Array(32),
    vaultId: new Uint8Array(32),
    identity,
    version: "0.0.0",
    now: () => time,
    fetcher: async () => {
      requests++;

      return Response.json(
        requests < 650
          ? { kind: "pending", expiresAt: 400000 }
          : { message: "ready", expiresAt: 400000 },
      );
    },
  });

  const pause = async () => {
    time += 500;
  };

  expect(await waitMessage(client, "/slot", () => time, 600000, pause)).toBe("ready");
  expect(requests).toBe(650);

  try {
    await waitMessage(client, "/slot", () => time, 200, pause);
    throw new Error("Expected pairing timeout");
  } catch (error) {
    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
    expect(String(error)).toContain("Pairing timed out");
  }

  expect(requests).toBe(650);
});

for (const [body, expected] of [
  [{ kind: "pending", expiresAt: 123 }, { expiresAt: 123 }],
  [
    { message: "ready", expiresAt: 123 },
    { message: "ready", expiresAt: 123 },
  ],
  [{ message: "approval" }, { message: "approval", expiresAt: 999 }],
] as const)
  test("pairing response preserves server expiry", () => {
    expect(pairingResponse(body, 999)).toEqual(expected);
  });

test("mailbox polling stops at server expiry instead of the caller guess", async () => {
  const keys = p.generateDeviceKeys();
  let now = 0;
  let requests = 0;

  const client = createClient({
    address: "http://server.test",
    pin: new Uint8Array(32),
    vaultId: new Uint8Array(32),
    identity: {
      keys,
      record: {
        id: p.deviceId(keys),
        name: "test",
        encPub: keys.encPub,
        objPub: keys.objPub,
        reqPub: keys.reqPub,
      },
    },
    version: "0.0.0",
    now: () => now,
    fetcher: async () => {
      requests++;

      return Response.json({ kind: "pending", expiresAt: 100 });
    },
  });

  await Promise.resolve(
    expect(
      waitMessage(
        client,
        "/slot",
        () => now,
        600000,
        async () => {
          now += 50;
        },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
  );

  expect(requests).toBe(2);
  expect(now).toBe(100);
});
