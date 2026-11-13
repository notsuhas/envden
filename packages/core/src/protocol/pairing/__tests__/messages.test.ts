import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/pairing.json";

test("pairing OPAQUE stored finish calls", async () => {
  const result = await p.opaqueFinishLogin({
    password: "01234567",
    clientLoginState: vector.login.clientLoginState,
    loginResponse: vector.login.loginResponse,
    identifiers: vector.ids.identifiers,
  });

  expect(result).toBeDefined();
  if (!result) throw Error("Pairing failed");
  expect(result.sessionKey).toBe(vector.login.sessionKey);

  const server = await p.opaqueServerFinishLogin({
    serverLoginState: vector.login.serverLoginState,
    finishLoginRequest: result.finishLoginRequest,
    identifiers: vector.ids.identifiers,
  });

  expect(server.sessionKey).toBe(result.sessionKey);

  expect(
    await p.opaqueFinishLogin({
      password: "01234568",
      clientLoginState: vector.login.clientLoginState,
      loginResponse: vector.login.loginResponse,
      identifiers: vector.ids.identifiers,
    }),
  ).toBeUndefined();
});

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
