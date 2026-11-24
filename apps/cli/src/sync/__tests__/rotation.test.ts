import { removeFile } from "../remove.ts";
import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";

const fixtureClock = () => 1800000000000;

import { join } from "node:path";
import { loadState, saveState } from "../../state/store/repository.ts";

import { rotateVault } from "../../admin/devices/rotate.ts";
import { push, pull } from "../engine.ts";

import { syncFixture } from "./flows.ts";

test("sync rotation", async () => {
  const fixture = await syncFixture();
  const { first, second, now, opts } = fixture;

  try {
    await pull(second, opts);
    const bStore = (await loadState(second.home))!.links[0]!.store;
    await rotateVault(first, now);
    await pull(second, opts);
    expect(await second.keychain.get(`envden/${second.home}/epoch/2`)).not.toBeUndefined();
    const placement = second.placement;
    let removals = 0;

    second.placement = (mode, root) => {
      const adapter = placement(mode, root);

      return {
        ...adapter,
        remove: async (...args) => {
          removals++;
          await adapter.remove(...args);
        },
      };
    };

    await removeFile(first, join(fixture.checkout.root, ".env"), { yes: true, now });
    await push(first, opts);
    await pull(second, opts);
    expect(await Bun.file(bStore).exists()).toBe(false);
    expect(removals).toBe(1);
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
    await saveState(second.home, before, fixtureClock);
    await rotateVault(first, now);
    const ensureIgnored = second.repo.ensureIgnored.bind(second.repo);
    let placements = 0;

    second.repo.ensureIgnored = async () => {
      if (++placements === 2) throw new Error("placement crash");
    };

    expect((await pull(second, opts)).conflicts).toBe(1);
    expect(await second.keychain.get(`envden/${second.home}/epoch/2`)).not.toBeUndefined();
    const interrupted = (await loadState(second.home))!;
    expect(interrupted.keyring).not.toBe(before.keyring);
    expect(interrupted.checkpoint).not.toBe(before.checkpoint);
    second.repo.ensureIgnored = ensureIgnored;
    expect((await pull(second, opts)).kind).toBe("pulled");
    expect((await loadState(second.home))!.checkpoint).not.toBe(before.checkpoint);
  } finally {
    await fixture.cleanup();
  }
});
