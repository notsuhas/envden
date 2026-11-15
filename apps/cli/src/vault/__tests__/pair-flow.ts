import { resumeApproval } from "../../pairing/persistence/submission.ts";
import { listDevices } from "../../admin/devices/list.ts";
import { expect } from "bun:test";
import { lstat, rm } from "node:fs/promises";
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
import { exchangeJoiner, resumeJoiner, resendJoiner } from "../../pairing/joiner.ts";

const fixtureClock = () => 1800000000000;

import { setupFlow } from "./setup-flow.ts";

function signal() {
  let resolve = () => {};

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

export async function pairedFlow(
  beforeResume?: (flow: Awaited<ReturnType<typeof setupFlow>>) => Promise<void>,
  interrupt = false,
) {
  const flow = await setupFlow();
  const { root, now, first, second, address, result, fetcher } = flow;

  try {
    const checkout = {
      root: join(root, "checkout"),
      gitDir: join(root, "checkout", ".git"),
      repoId: "github.com/example/project",
    };

    await atomicWrite(join(checkout.root, ".env"), "TOKEN=local-test-value\n", fixtureClock);

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
    await rm(join(first.home, "state", "applied-files.json"));
    await pushInitialFiles(first, result.state, now);
    const { appliedFiles } = await import("../../sync/local/applied.ts");
    expect(Object.keys(await appliedFiles(first.home))).toHaveLength(1);
    const vaultId = p.unbase32(result.kit.vaultId);
    const pin = binary(result.state.server!.pin);
    const identity = await deviceIdentity(first.keychain, first.home, "first");

    let approvalLost = false;
    let joinerLost = false;
    const joinerMessages: string[] = [];

    const client = createClient({
      address,
      vaultId,
      pin,
      identity,
      now,
      fetcher: async (input, init) => {
        const response = await fetcher(input, init);

        if (
          interrupt &&
          !approvalLost &&
          new URL(input instanceof Request ? input.url : input.toString()).pathname === "/v1/swap"
        ) {
          approvalLost = true;
          throw new Error("Lost approval response");
        }

        return response;
      },
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
      fetcher: async (input, init) => {
        if (
          new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith(
            "/PairJoiner",
          )
        ) {
          if (typeof init?.body !== "string")
            throw new Error("Expected serialized pairing message");

          joinerMessages.push(init.body);

          if (interrupt && !joinerLost) {
            joinerLost = true;
            throw new Error("Lost joiner request");
          }
        }

        return fetcher(input, init);
      },
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
        expect(
          await lstat(join(first.home, "state", "write.lock")).catch(() => undefined),
        ).toBeUndefined();

        if (slot === "KE1") await ke1.promise;
        else {
          ke2.resolve();
          await ke3.promise;
        }
      },
      async () => true,
    );

    const exchange = exchangeJoiner(second, joinerClient, joiner, pin, attempt.code, async () => {
      expect(
        await lstat(join(second.home, "state", "write.lock")).catch(() => undefined),
      ).toBeUndefined();

      ke1.resolve();
      await ke2.promise;
    });

    if (interrupt) {
      await Promise.resolve(expect(exchange).rejects.toMatchObject({ code: "SERVER_UNREACHABLE" }));
      await resendJoiner(second, joinerClient);
      expect(joinerMessages[0]).toBe(joinerMessages[1]);
    } else await exchange;

    ke3.resolve();

    if (interrupt) {
      await Promise.resolve(expect(pairing).rejects.toMatchObject({ code: "SERVER_UNREACHABLE" }));
      expect(await resumeApproval(first, client, vaultId)).toBe(true);
    } else expect((await pairing).kind).toBe("paired");

    const devices = await listDevices(first, now);

    expect(devices.find((device) => device.name === "second")).toMatchObject({
      clientVersion: null,
      unconfirmed: true,
    });

    await beforeResume?.(flow);

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
