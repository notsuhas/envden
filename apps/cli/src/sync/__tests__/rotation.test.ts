import { expect, test } from "bun:test";
import { rm, mkdir } from "node:fs/promises";

import { join } from "node:path";
import { loadState, saveState } from "../../state/repository.ts";

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

test("interrupted rotation placement preserves a compatible checkpoint and resumes", async () => {
  const fixture = await syncFixture();
  const { first, second, now, opts } = fixture;

  try {
    await pull(second, opts);
    const before = (await loadState(second.home))!;
    const extra = { ...fixture.checkoutB, root: join(fixture.root, "extra") };
    await mkdir(extra.root);
    before.approved.push(extra);
    await saveState(second.home, before);
    await rotateVault(first, "master password", now);
    const ensureIgnored = second.repo.ensureIgnored.bind(second.repo);
    let placements = 0;

    second.repo.ensureIgnored = async () => {
      if (++placements === 2) throw new Error("placement crash");
    };

    await Promise.resolve(expect(pull(second, opts)).rejects.toThrow("placement crash"));
    expect(await second.keychain.get(`envden/${second.home}/epoch/2`)).not.toBeUndefined();
    const interrupted = (await loadState(second.home))!;
    expect(interrupted.keyring).toBe(before.keyring);
    expect(interrupted.checkpoint).toBe(before.checkpoint);
    second.repo.ensureIgnored = ensureIgnored;
    expect((await pull(second, opts)).kind).toBe("pulled");
    expect((await loadState(second.home))!.checkpoint).not.toBe(before.checkpoint);
  } finally {
    await fixture.cleanup();
  }
});
