import type { TFetch } from "../../client/fetch.ts";
import { rotateVault } from "../../admin/devices/rotate.ts";
import { test, expect } from "bun:test";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { kitJoin } from "../../vault/recovery/kit.ts";
import { removeDevice } from "../../admin/devices/remove.ts";
import { rejoinIdentity } from "../../admin/rejoin/classify.ts";
import { adminContext } from "../../admin/shared/context.ts";
import { createClient } from "../../client/request.ts";
import { binary } from "../../client/encoding.ts";
import { openPairing, approvePairing } from "../approver.ts";
import { exchangeJoiner, resumeJoiner } from "../joiner.ts";
import { loadState } from "../../state/repository.ts";

function signal() {
  let resolve = () => {};

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

test("removed device rejoins through pairing with a new identity and retained floor", async () => {
  const f = await fixture();

  try {
    const second = f.home("second");

    await kitJoin(second, {
      ...f.result.kit,
      address: f.result.kit.server,
      password: "old password",
      name: "second",
      now: f.now,
      fetcher: fetch,
    });

    const before = await loadState(second.home);
    await removeDevice(f.first, "second", "old password", f.now);
    let raced = false;

    const fetcher: TFetch = async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;

      if (path === "/v1/swap" && !raced) {
        raced = true;
        await rotateVault(f.first, "old password", f.now);
      }

      return fetch(input, init);
    };

    const context = await adminContext(f.first, f.now, fetcher);
    const pin = binary(context.local.server!.pin);
    const attempt = await openPairing(context.client, pin);
    const identity = await rejoinIdentity(second, "second");

    const client = createClient({
      address: f.result.kit.server,
      pin,
      vaultId: new Uint8Array(32),
      identity,
      version: "0.0.0",
      now: f.now,
      fetcher: fetch,
    });

    const ke1 = signal();
    const ke2 = signal();
    const ke3 = signal();

    const approval = approvePairing(
      f.first,
      context.client,
      context.identity,
      pin,
      context.vaultId,
      attempt,
      f.now,
      async (slot) => {
        if (slot === "KE1") await ke1.promise;
        else {
          ke2.resolve();
          await ke3.promise;
        }
      },
      async () => true,
    );

    await exchangeJoiner(second, client, identity, pin, attempt.code, async () => {
      ke1.resolve();
      await ke2.promise;
    });

    ke3.resolve();
    expect((await approval).kind).toBe("paired");
    expect(raced).toBe(true);
    const state = await resumeJoiner(second, client, identity, f.result.kit.server, pin, true);
    expect(state.vaultId).toBe(before?.vaultId);
    expect(state.headers.length).toBeGreaterThan(before!.headers.length);
    expect(await second.keychain.get(`envden/${second.home}/rejoin/device`)).toBeUndefined();
  } finally {
    await f.close();
  }
});
