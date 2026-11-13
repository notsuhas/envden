import { listDevices } from "../../admin/devices/list.ts";
import { expect } from "bun:test";
import { join } from "node:path";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { atomicWrite } from "../../state/store/files.ts";
import { linkCheckout } from "../../links/place.ts";
import { pushInitialFiles } from "../initial/push.ts";
import * as p from "@envden/core/protocol";
import { kitJoin } from "../recovery/kit.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { createClient } from "../../client/request.ts";
import { binary } from "../../client/encoding.ts";
import { login } from "../../session/login.ts";
import { openPairing, approvePairing } from "../../pairing/approver.ts";
import { exchangeJoiner, resumeJoiner } from "../../pairing/joiner.ts";

import { setupFlow } from "./setup-flow.ts";

function signal() {
  let resolve = () => {};

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

export async function pairedFlow() {
  const flow = await setupFlow();
  const { root, now, first, second, address, result, fetcher } = flow;

  try {
    const checkout = {
      root: join(root, "checkout"),
      gitDir: join(root, "checkout", ".git"),
      repoId: "github.com/example/project",
    };

    await atomicWrite(join(checkout.root, ".env"), "TOKEN=local-test-value\n");

    first.repo = createFakeRepoAdapter({
      envFiles: async () => [".env"],
      ensureIgnored: async () => {},
    });

    let approvals = 0;

    await linkCheckout(first, result.state, checkout, async () => {
      approvals++;

      return true;
    });

    expect(approvals).toBe(1);
    await pushInitialFiles(first, result.state, now);
    await pushInitialFiles(first, result.state, now);
    const vaultId = p.unbase32(result.kit.vaultId);
    const pin = binary(result.state.server!.pin);
    const identity = await deviceIdentity(first.keychain, first.home, "first");

    const client = createClient({
      address,
      vaultId,
      pin,
      identity,
      now,
      fetcher,
      version: "0.0.0",
    });

    await login(client, vaultId, "master password");
    const attempt = await openPairing(client, pin);
    const joiner = await deviceIdentity(second.keychain, second.home, "second");

    const joinerClient = createClient({
      address,
      pin,
      vaultId: new Uint8Array(32),
      identity: joiner,
      now,
      fetcher,
      version: "0.0.0",
    });

    const ke1 = signal();
    const ke2 = signal();
    const ke3 = signal();

    const pairing = approvePairing(
      first,
      client,
      identity,
      pin,
      vaultId,
      attempt,
      now,
      async (slot) => {
        if (slot === "KE1") await ke1.promise;
        else {
          ke2.resolve();
          await ke3.promise;
        }
      },
      async () => true,
    );

    await exchangeJoiner(second, joinerClient, joiner, pin, attempt.code, async () => {
      ke1.resolve();
      await ke2.promise;
    });

    ke3.resolve();
    expect((await pairing).kind).toBe("paired");
    const devices = await listDevices(first, now);

    expect(devices.find((device) => device.name === "second")).toMatchObject({
      clientVersion: null,
      unconfirmed: true,
    });

    expect((await resumeJoiner(second, joinerClient, joiner, address, pin)).vaultId).toBe(
      result.kit.vaultId,
    );

    expect(
      (await listDevices(first, now)).find((device) => device.name === "second"),
    ).toMatchObject({ clientVersion: "0.0.0", unconfirmed: false });

    return { ...flow, client, identity, pin, vaultId };
  } catch (error) {
    await flow.cleanup();
    throw error;
  }
}

export async function joinedFlow() {
  const flow = await pairedFlow();
  const { third, address, result, now, fetcher } = flow;

  try {
    const recovered = await kitJoin(third, {
      address,
      vaultId: result.kit.vaultId,
      secretKey: result.kit.secretKey,
      password: "master password",
      name: "third",
      now,
      fetcher,
    });

    expect(recovered.vaultId).toBe(result.kit.vaultId);
    expect(recovered.entries).toHaveLength(4);

    return { ...flow, recovered };
  } catch (error) {
    await flow.cleanup();
    throw error;
  }
}
