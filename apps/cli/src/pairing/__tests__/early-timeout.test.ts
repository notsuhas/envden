import { expect, test } from "bun:test";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { setupFlow } from "../../vault/__tests__/setup-flow.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { createClient } from "../../client/request.ts";
import { binary } from "../../client/encoding.ts";
import { login } from "../../session/login.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { openPairing } from "../approver.ts";
import { exchangeJoiner } from "../joiner.ts";

test("timeout before KE2 clears unusable resume markers and requests a fresh code", async () => {
  const f = await setupFlow();

  try {
    const pin = binary(f.result.state.server!.pin);
    const identity = await deviceIdentity(f.first.keychain, f.first.home, "first");

    const client = createClient({
      address: f.address,
      pin,
      vaultId: p.unbase32(f.result.kit.vaultId),
      identity,
      now: f.now,
      fetcher: f.fetcher,
      version: "0.0.0",
    });

    await login(client, p.unbase32(f.result.kit.vaultId), "master password");
    const attempt = await openPairing(client, pin);
    const joiner = await deviceIdentity(f.second.keychain, f.second.home, "second");

    const joining = createClient({
      address: f.address,
      pin,
      vaultId: new Uint8Array(32),
      identity: joiner,
      now: f.now,
      fetcher: f.fetcher,
      version: "0.0.0",
    });

    await atomicWrite(join(f.second.home, "state", "pair-pin"), "saved");
    await atomicWrite(join(f.second.home, "state", "pair-expiry"), "saved");

    await Promise.resolve(
      expect(
        exchangeJoiner(f.second, joining, joiner, pin, attempt.code, async () => {
          throw new EnvdenError("BUSY", "Pairing timed out");
        }),
      ).rejects.toThrow("create a new pairing code"),
    );

    expect(await optionalRead(join(f.second.home, "state", "pair-pin"))).toBeUndefined();
    expect(await optionalRead(join(f.second.home, "state", "pair-expiry"))).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
