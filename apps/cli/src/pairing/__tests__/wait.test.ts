import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { createClient } from "../../client/request.ts";
import { waitMessage } from "../wait.ts";

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

      return Response.json(requests < 3 ? { kind: "pending" } : { message: "ready" });
    },
  });

  const pause = async () => {
    time += 100;
  };

  expect(await waitMessage(client, "/slot", () => time, 1000, pause)).toBe("ready");
  expect(requests).toBe(3);

  try {
    await waitMessage(client, "/slot", () => time, 200, pause);
    throw new Error("Expected pairing timeout");
  } catch (error) {
    expect(error).toMatchObject({ code: "UNAUTHORIZED" });
    expect(String(error)).toContain("Pairing timed out");
  }

  expect(requests).toBe(3);
});
