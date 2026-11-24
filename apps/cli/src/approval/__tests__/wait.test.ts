import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { createClient } from "../../client/request.ts";
import { waitMessage, slotResponse } from "../wait.ts";

test("join request waiting accepts pending replies and expires using the supplied clock", async () => {
  const keys = p.generateDeviceKeys();
  const server = p.generateRecoveryKeys();

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
    pin: p.serverPin(server.objPub),
    vaultId: new Uint8Array(32),
    identity,
    version: "0.0.0",
    now: () => time,
    fetcher: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());

      if (url.pathname === "/v1/hello")
        return Response.json({
          hello: Buffer.from(
            p.signedCodec(p.ServerHelloCodec).write(
              p.buildHello(
                {
                  challenge: new Uint8Array(
                    Buffer.from(url.searchParams.get("challenge")!, "base64url"),
                  ),
                  host: url.hostname,
                  serverSignPub: server.objPub,
                  appVersion: "1.0.0",
                  minClient: "0.0.0",
                  protocols: [p.PROTOCOL_VERSION],
                },
                server.objSk,
              ),
            ),
          ).toString("base64url"),
        });

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
    throw new Error("Expected join timeout");
  } catch (error) {
    expect(error).toMatchObject({ code: "BUSY" });
    expect(String(error)).toContain("expired");
  }

  expect(requests).toBe(650);
});

test("join slot responses keep the server expiry and reject other shapes", () => {
  expect(slotResponse({ kind: "pending", expiresAt: 123 })).toEqual({ expiresAt: 123 });

  expect(slotResponse({ message: "ready", expiresAt: 123 })).toEqual({
    message: "ready",
    expiresAt: 123,
  });

  expect(() => slotResponse({ message: "approval" })).toThrow();
});

test("join request polling stops at server expiry instead of the caller guess", async () => {
  const keys = p.generateDeviceKeys();
  const server = p.generateRecoveryKeys();
  let now = 0;
  let expiry = 100;
  let requests = 0;

  const client = createClient({
    address: "http://server.test",
    pin: p.serverPin(server.objPub),
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
    fetcher: async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());

      if (url.pathname === "/v1/hello")
        return Response.json({
          hello: Buffer.from(
            p.signedCodec(p.ServerHelloCodec).write(
              p.buildHello(
                {
                  challenge: new Uint8Array(
                    Buffer.from(url.searchParams.get("challenge")!, "base64url"),
                  ),
                  host: url.hostname,
                  serverSignPub: server.objPub,
                  appVersion: "1.0.0",
                  minClient: "0.0.0",
                  protocols: [p.PROTOCOL_VERSION],
                },
                server.objSk,
              ),
            ),
          ).toString("base64url"),
        });

      requests++;

      return Response.json({ kind: "pending", expiresAt: expiry });
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
    ).rejects.toMatchObject({ code: "BUSY" }),
  );

  expect(requests).toBe(2);
  expect(now).toBe(100);
});
