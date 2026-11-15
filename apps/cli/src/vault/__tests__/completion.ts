import { expect } from "bun:test";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import type { TAdapters } from "../../adapters.ts";
import { loadState } from "../../state/store/repository.ts";
import { createClient } from "../../client/request.ts";
import type { TClient } from "../../client/request.ts";
import { deviceIdentity } from "../../identity/device.ts";
import type { TDeviceIdentity } from "../../identity/device.ts";
import type { setupVault } from "../setup.ts";
import { openPairing, approvePairing } from "../../pairing/approver.ts";

const fixtureClock = () => 1800000000000;

import { promptPairing } from "../../pairing/prompt.ts";
import { finishPairing } from "../../pairing/finish.ts";
import { recoveryJoin } from "../../onboarding/join/recovery.ts";
import { unlockDevice } from "../../session/unlock.ts";
import { saveState } from "../../state/store/repository.ts";
import { readFile, writeFile } from "node:fs/promises";

function signal() {
  let resolve = () => {};

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

interface ICompletion {
  first: TAdapters;
  client: TClient;
  identity: TDeviceIdentity;
  address: string;
  pin: Uint8Array;
  vaultId: Uint8Array;
  now: () => number;
  root: string;
  fetcher: TAdapters["fetcher"];
  kit: Awaited<ReturnType<typeof setupVault>>["kit"];
}

export async function checkCompletion(input: ICompletion) {
  const { first, client, identity, address, pin, vaultId, now, root, kit, fetcher } = input;

  const fourth = createAdapters(
    {
      fetcher,
      home: join(root, "fourth"),
      userHome: root,
      keychain: createMemoryKeychainAdapter(["get", "set", "delete"]),
    },
    fixtureClock,
  );

  const nextAttempt = await openPairing(client, pin);
  const fourthIdentity = await deviceIdentity(fourth.keychain, fourth.home, "fourth");

  const fourthClient = createClient({
    address,
    pin,
    vaultId: new Uint8Array(32),
    identity: fourthIdentity,
    now,
    fetcher,
    version: "0.0.0",
  });

  const started = signal();
  const answered = signal();
  const finished = signal();

  const approval = approvePairing(
    first,
    client,
    identity,
    pin,
    vaultId,
    nextAttempt,
    now,
    async (slot) => {
      if (slot === "KE1") await started.promise;
      else {
        answered.resolve();
        await finished.promise;
      }
    },
    async () => true,
  );

  await promptPairing(fourth, fourthClient, fourthIdentity, pin, now, {
    input: async () => nextAttempt.code,
    waitMessage: async (_client, path, _now, expiry) => {
      expect(path).toBe(
        `/v1/pairing/mailboxes/${p.normalizePairingCode(nextAttempt.code).mailbox}/KE2`,
      );

      expect(await readFile(join(fourth.home, "state/pair-expiry"), "utf8")).toBe(String(expiry));
      started.resolve();
      await answered.promise;

      return "";
    },
  });

  finished.resolve();
  expect((await approval).kind).toBe("paired");
  await finishPairing(fourth, fourthClient, fourthIdentity, address, pin, now);
  expect((await loadState(fourth.home))?.vaultId).toBe(kit.vaultId);
  await writeFile(join(fourth.home, "state/pair-expiry"), String(now() - 86400000));

  await Promise.resolve(
    expect(
      finishPairing(fourth, fourthClient, fourthIdentity, address, pin, now),
    ).rejects.toMatchObject({ code: "BUSY" }),
  );

  const kitPath = join(root, "kit.json");
  await writeFile(kitPath, JSON.stringify(kit));

  const fifth = createAdapters(
    {
      fetcher,
      home: join(root, "fifth"),
      userHome: root,
      keychain: createMemoryKeychainAdapter(["get", "set", "delete"]),
    },
    fixtureClock,
  );

  await recoveryJoin(fifth, address, "fifth", kitPath, now, async () => "old password");
  expect((await loadState(fifth.home))?.vaultId).toBe(kit.vaultId);

  const saved = (await loadState(first.home))!;
  delete saved.session;
  await saveState(first.home, saved, fixtureClock);
  await unlockDevice(first, "old password", now, fetcher);
  const unlocked = (await loadState(first.home))!;
  expect(unlocked.session?.unlockedUntil).toBeGreaterThan(now());

  await Promise.resolve(
    expect(unlockDevice(first, "wrong password", now, fetcher)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Wrong master password",
    }),
  );

  expect((await loadState(first.home))?.session).toEqual(unlocked.session);

  const asked: boolean[] = [];

  const answers = async (retry: boolean) => {
    asked.push(retry);

    return "wrong password";
  };

  await Promise.resolve(
    expect(unlockDevice(first, answers, now, fetcher)).rejects.toMatchObject({
      message: "Wrong master password",
    }),
  );

  expect(asked).toEqual([false, true, true]);
}
