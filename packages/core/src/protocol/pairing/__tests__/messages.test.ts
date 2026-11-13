import { test, expect } from "bun:test";
import * as p from "../../index.ts";

test("typed pairing boxes authenticate and reject wrong message type", () => {
  const keys = p.generateDeviceKeys(),
    device = {
      id: p.deviceId(keys),
      name: "joiner",
      encPub: keys.encPub,
      objPub: keys.objPub,
      reqPub: keys.reqPub,
    },
    key = new Uint8Array(32);

  const box = p.sealPairJoiner({ device }, key);
  expect(p.openPairJoiner(box, key)).toEqual({ device });
  expect(() => p.openPairApprover(box, key)).toThrow();

  const approver = { vaultId: key, serverPin: key, manifestHash: key },
    reply = p.sealPairApprover(approver, key);

  expect(p.openPairApprover(reply, key)).toEqual(approver);
  expect(() => p.openPairJoiner(reply, key)).toThrow();
  expect(() => p.openPairJoiner(new Uint8Array(4097), key)).toThrow();
});
