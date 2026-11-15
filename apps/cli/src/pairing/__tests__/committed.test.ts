import { test, expect } from "bun:test";
import { join } from "node:path";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { createClient } from "../../client/request.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { binary } from "../../client/encoding.ts";
import { exchangeJoiner } from "../joiner.ts";

const fixtureClock = () => 1800000000000;

test("committed join refuses before any exchange and clears pending pairing", async () => {
  const f = await fixture();

  try {
    const identity = await deviceIdentity(f.first.keychain, f.first.home, "first");
    const pin = binary(f.result.state.server!.pin);
    let requests = 0;

    const client = createClient({
      address: f.result.kit.server,
      pin,
      identity,
      vaultId: new Uint8Array(32),
      version: "0.0.0",
      now: f.now,
      fetcher: async () => {
        requests++;
        throw new Error("Unexpected exchange");
      },
    });

    const saved = join(f.first.home, "state", "pair-joiner");
    await atomicWrite(saved, "pending", fixtureClock);

    await Promise.resolve(
      expect(
        exchangeJoiner(f.first, client, identity, pin, "3-K7QF-2MXP", async () => {}),
      ).rejects.toMatchObject({ code: "CONFLICT" }),
    );

    expect(requests).toBe(0);
    expect(await optionalRead(saved)).toBeUndefined();
  } finally {
    await f.close();
  }
});
