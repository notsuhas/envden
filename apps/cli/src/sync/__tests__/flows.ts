import { expect } from "bun:test";
import { cp, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@envden/server";
import type { ICheckout } from "@envden/core/adapters";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import type { TAdapters } from "../../adapters.ts";
import type { TClient } from "../../client/request.ts";
import type { TFetch } from "../../client/fetch.ts";
import { loadState, saveState } from "../../state/repository.ts";
import { atomicWrite } from "../../state/files.ts";
import { login } from "../../session/login.ts";
import { rotateVault } from "../../admin/devices/rotate.ts";
import { push, pull } from "../engine.ts";
import { firstRun } from "../first-run.ts";
import { diff } from "../diff.ts";
import { resolveConflict } from "../resolve.ts";

export async function verifySyncFlows(input: {
  first: TAdapters;
  second: TAdapters;
  third: TAdapters;
  checkout: ICheckout;
  aStore: string;
  root: string;
  now: () => number;
  bClient: TClient;
  vaultId: Uint8Array;
}) {
  const { first, second, third, checkout, aStore, root, now, bClient, vaultId } = input;

  const checkoutB = {
    ...checkout,
    root: join(root, "checkout-b"),
    gitDir: join(root, "checkout-b", ".git"),
  };

  first.repo = createFakeRepoAdapter({
    checkoutAt: async () => checkout,
    ensureIgnored: async () => {},
  });

  second.repo = createFakeRepoAdapter({
    checkoutAt: async () => checkoutB,
    ensureIgnored: async () => {},
  });

  await mkdir(checkoutB.root, { recursive: true });
  const bState = (await loadState(second.home))!;
  bState.approved.push(checkoutB);
  await saveState(second.home, bState);
  await login(bClient, vaultId, "master password");
  const opts = { now, fetcher: fetch, all: true, yes: true };

  const checkoutC = {
    ...checkout,
    root: join(root, "checkout-c"),
    gitDir: join(root, "checkout-c", ".git"),
  };

  third.repo = createFakeRepoAdapter({
    checkoutAt: async () => checkoutC,
    ensureIgnored: async () => {},
  });

  const cState = (await loadState(third.home))!;
  cState.approved.push(checkoutC);
  await saveState(third.home, cState);
  await atomicWrite(join(checkoutC.root, ".env"), "TOKEN=third-local\n");
  let choices = 0;

  await firstRun(third, {
    ...opts,
    choose: async () => {
      choices++;

      return "take-server";
    },
  });

  expect(choices).toBe(1);
  expect(await readFile(join(checkoutC.root, ".env"), "utf8")).toBe("TOKEN=local-test-value\n");
  const cStore = (await loadState(third.home))!.links[0]!.store;

  for (const choice of ["keep-mine", "merge"] as const) {
    await atomicWrite(cStore, "TOKEN=third-local\n");
    await firstRun(third, { ...opts, choose: async () => choice });
    expect(await readFile(cStore, "utf8")).toBe("TOKEN=third-local\n");
  }

  expect((await pull(second, opts)).conflicts).toBe(0);
  expect(await readFile(join(checkoutB.root, ".env"), "utf8")).toBe("TOKEN=local-test-value\n");
  const bStore = (await loadState(second.home))!.links[0]!.store;
  await atomicWrite(aStore, "TOKEN=local-test-value\nA=one\n");
  expect((await push(first, opts)).kind).toBe("pushed");
  await pull(second, opts);
  expect(await readFile(bStore, "utf8")).toContain("A=one");
  await atomicWrite(aStore, "TOKEN=local-test-value\nA=two\n");
  await atomicWrite(bStore, "TOKEN=local-test-value\nA=one\nB=one\n");
  let raced = false;

  const racingFetch: TFetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());

    if (url.pathname === "/v1/swap" && !raced) {
      raced = true;
      await push(first, opts);
    }

    return fetch(input, init);
  };

  expect((await push(second, { ...opts, fetcher: racingFetch })).kind).toBe("pushed");
  expect(raced).toBe(true);
  expect(await readFile(bStore, "utf8")).toBe("TOKEN=local-test-value\nA=two\nB=one\n");
  await pull(first, opts);
  await atomicWrite(aStore, "TOKEN=local-test-value\nA=remote\nB=one\n");
  await atomicWrite(bStore, "TOKEN=local-test-value\nA=mine\nB=one\n");
  expect(JSON.stringify(await diff(second, opts))).not.toContain("local-test-value");
  await push(first, opts);
  expect((await pull(second, opts)).conflicts).toBe(1);
  expect(await readFile(bStore, "utf8")).toContain("A=mine");
  await resolveConflict(second, { file: ".env", choice: "take-server" });
  expect(await readFile(bStore, "utf8")).toContain("A=remote");
  await rotateVault(first, "master password", now);
  await pull(second, opts);
  expect(await second.keychain.get(`envden/${second.home}/epoch/2`)).not.toBeUndefined();
  await rm(aStore);
  await push(first, opts);
  await pull(second, opts);
  expect(await Bun.file(bStore).exists()).toBe(false);
  // Restore an older database through a second in-process server.
  const snapshot = join(root, "snapshot");
  await cp(join(root, "server"), snapshot, { recursive: true });
  await atomicWrite(aStore, "TOKEN=restored\n");
  await push(first, opts);
  const oldServer = await serve({ dataDir: snapshot, port: 0 });

  try {
    const oldFetch: TFetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      url.host = oldServer.server.url.host;

      return fetch(url, init);
    };

    expect(pull(first, { ...opts, fetcher: oldFetch })).rejects.toMatchObject({
      code: "ROLLBACK",
    });
  } finally {
    await oldServer.server.stop(true);
    oldServer.storage.close();
    oldServer.stopPruning();
  }
}
