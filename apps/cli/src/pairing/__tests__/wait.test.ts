import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { createClient } from "../../client/request.ts";
import { waitMessage, pairingResponse } from "../wait.ts";

test("mailbox waiting accepts pending replies and expires using the supplied clock", async () => {
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
                  protocols: [1],
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
  const server = p.generateRecoveryKeys();
  let now = 0;
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
                  protocols: [1],
                },
                server.objSk,
              ),
            ),
          ).toString("base64url"),
        });

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

test("approval retrieval has a separate 24-hour deadline", async () => {
  const { approvalDeadline } = await import("../finish.ts");
  expect(approvalDeadline(600000)).toBe(87000000);
});
