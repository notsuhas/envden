import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { createClient } from "../../client/request.ts";
import { waitMessage, pairingResponse } from "../wait.ts";

const fixtureClock = () => 1800000000000;

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
    expect(error).toMatchObject({ code: "BUSY" });
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
                  protocols: [1],
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
  now = 0;
  requests = 0;
  expiry = 99999999;

  await Promise.resolve(
    expect(
      waitMessage(
        client,
        "/slot",
        () => now,
        expiry,
        async () => {
          now += 300000;
        },
      ),
    ).rejects.toMatchObject({ code: "BUSY" }),
  );

  expect(now).toBe(600000);
  expect(requests).toBe(2);
});

test("approval retrieval has a separate 24-hour deadline", async () => {
  const { approvalDeadline } = await import("../finish.ts");
  expect(approvalDeadline(600000)).toBe(87000000);
});

test("mailbox response cannot extend the client deadline", () => {
  expect(pairingResponse({ kind: "pending", expiresAt: 99999999 }, 600000)).toEqual({
    expiresAt: 600000,
  });
});

test("timeout preserves the saved join exchange", async () => {
  const { setupFlow } = await import("../../vault/__tests__/setup-flow.ts");
  const { finishPairing } = await import("../finish.ts");
  const { atomicWrite, optionalRead } = await import("../../state/store/files.ts");
  const { join } = await import("node:path");
  const { deviceIdentity } = await import("../../identity/device.ts");
  const f = await setupFlow();

  try {
    const identity = await deviceIdentity(f.second.keychain, f.second.home, "second");

    const client = createClient({
      address: f.address,
      pin: p.unbase32(f.result.kit.vaultId),
      vaultId: new Uint8Array(32),
      identity,
      version: "0.0.0",
      now: f.now,
      fetcher: f.fetcher,
    });

    await atomicWrite(join(f.second.home, "state", "pair-expiry"), "0", fixtureClock);
    await atomicWrite(join(f.second.home, "state", "pair-joiner"), "saved", fixtureClock);
    await f.second.keychain.set(`envden/${f.second.home}/pair-receive`, new Uint8Array(32));

    await Promise.resolve(
      expect(
        finishPairing(f.second, client, identity, f.address, new Uint8Array(32), f.now),
      ).rejects.toMatchObject({ code: "BUSY" }),
    );

    expect(await optionalRead(join(f.second.home, "state", "pair-joiner"))).toBe("saved");
    expect(await f.second.keychain.get(`envden/${f.second.home}/pair-receive`)).not.toBeNull();
  } finally {
    await f.cleanup();
  }
});
