import { listDevices } from "../../admin/devices/list.ts";
import { verifySyncFlows } from "../../sync/__tests__/flows.ts";
import { test, expect, spyOn, setSystemTime } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@envden/server";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { atomicWrite } from "../../state/files.ts";
import { linkCheckout } from "../../links/place.ts";
import { pushInitialFiles } from "../initial/push.ts";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import * as p from "@envden/core/protocol";
import { createAdapters } from "../../adapters.ts";
import { setupVault } from "../setup.ts";
import { kitJoin } from "../recovery/kit.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { createClient } from "../../client/request.ts";
import { binary } from "../../client/encoding.ts";
import { login } from "../../session/login.ts";
import { openPairing, approvePairing } from "../../pairing/approver.ts";
import { exchangeJoiner, resumeJoiner } from "../../pairing/joiner.ts";

function signal() {
  let resolve = () => {};

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

test("real server: setup, pair a second home, kit join a third", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-cli-flow-"));
  const now = () => 1800000000000;
  setSystemTime(now());
  const log = spyOn(console, "log").mockImplementation(() => {});
  const running = await serve({ dataDir: join(root, "server"), port: 0 });

  const token = log.mock.calls
    .flat()
    .find((value) => typeof value === "string" && value.startsWith("envden-setup-1:"));

  log.mockRestore();

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");

    const homes = ["first", "second", "third"].map((name) =>
      createAdapters({
        home: join(root, name),
        userHome: join(root, name),
        keychain: createMemoryKeychainAdapter(["get", "set", "delete"]),
      }),
    );

    const first = homes[0]!;
    const second = homes[1]!;
    const third = homes[2]!;
    const address = running.server.url.toString();

    const result = await setupVault(first, {
      address,
      token,
      name: "first",
      password: "master password",
      now,
      fetcher: fetch,
    });

    expect(result.state.vaultId).toBe(result.kit.vaultId);

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
    const vaultId = p.unbase32(result.kit.vaultId);
    const pin = binary(result.state.server!.pin);
    const identity = await deviceIdentity(first.keychain, first.home, "first");

    const client = createClient({
      address,
      vaultId,
      pin,
      identity,
      now,
      fetcher: fetch,
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
      fetcher: fetch,
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

    const recovered = await kitJoin(third, {
      address,
      vaultId: result.kit.vaultId,
      secretKey: result.kit.secretKey,
      password: "master password",
      name: "third",
      now,
      fetcher: fetch,
    });

    expect(recovered.vaultId).toBe(result.kit.vaultId);
    expect(recovered.entries).toHaveLength(4);

    await verifySyncFlows({
      first,
      second,
      third,
      checkout,
      aStore: result.state.links[0]!.store,
      root,
      now,
      bClient: joinerClient.forVault(vaultId),
      vaultId,
    });
  } finally {
    await running.server.stop(true);
    running.storage.close();
    setSystemTime();
    await rm(root, { recursive: true, force: true });
  }
});
