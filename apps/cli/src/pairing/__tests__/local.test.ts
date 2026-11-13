import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { preparePairing, finishApprover } from "../local.ts";
import { requireWindow } from "../exchange.ts";

test("local OPAQUE pairing allows one attempt and derives the same channel keys", async () => {
  const pin = p.randomBytes(32);
  const attempt = await preparePairing(pin, 3);
  const { password } = p.normalizePairingCode(attempt.code);
  const start = await p.opaqueStartLogin(password);
  const response = await attempt.answer(start.startLoginRequest);
  expect(attempt.answer(start.startLoginRequest)).rejects.toMatchObject({ code: "UNAUTHORIZED" });

  const finish = await p.opaqueFinishLogin({
    password,
    clientLoginState: start.clientLoginState,
    loginResponse: response.loginResponse,
    identifiers: p.pairingIdentifiers(pin, 3).identifiers,
  });

  if (!finish) throw new Error("Pair login failed");
  const server = await finishApprover(pin, 3, response.serverLoginState, finish.finishLoginRequest);
  const client = p.pairingChannelKeys(new Uint8Array(Buffer.from(finish.sessionKey, "base64url")));
  expect(server).toEqual(client);
  expect(() => requireWindow(1000, 1000)).toThrow();
  expect(() => requireWindow(1000, 999)).not.toThrow();
});
