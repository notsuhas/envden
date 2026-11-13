import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";

import { loadState } from "../../state/repository.ts";

import { rotateVault } from "../../admin/devices/rotate.ts";
import { push, pull } from "../engine.ts";

import { syncFixture } from "./flows.ts";

test("sync rotation", async () => {
  const fixture = await syncFixture();
  const { first, second, aStore, now, opts } = fixture;

  try {
    await pull(second, opts);
    const bStore = (await loadState(second.home))!.links[0]!.store;
    await rotateVault(first, "master password", now);
    await pull(second, opts);
    expect(await second.keychain.get(`envden/${second.home}/epoch/2`)).not.toBeUndefined();
    await rm(aStore);
    await push(first, opts);
    await pull(second, opts);
    expect(await Bun.file(bStore).exists()).toBe(false);
  } finally {
    await fixture.cleanup();
  }
});
