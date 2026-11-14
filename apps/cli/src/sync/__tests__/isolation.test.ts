import { expect, test } from "bun:test";
import { join } from "node:path";
import { symlink, rm } from "node:fs/promises";
import { createSharedFixture } from "./shared-fixture.ts";

const syncFixture = createSharedFixture();

import { pull, push } from "../engine.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { linkCheckout } from "../../links/place.ts";
import { atomicWrite } from "../../state/store/files.ts";

for (const published of [false, true])
  test(`unsafe file does not block its neighbour: published=${published}`, async () => {
    const f = await syncFixture();

    try {
      await pull(f.second, f.opts);
      const state = (await loadState(f.second.home))!;
      f.second.repo.envFiles = async () => [".env.bad"];
      await atomicWrite(join(f.checkoutB.root, ".env.bad"), "TOKEN=bad\n");
      await linkCheckout(f.second, state, f.checkoutB, async () => true, true);
      await saveState(f.second.home, state);
      if (published) await push(f.second, f.opts);
      await rm(join(f.checkoutB.root, ".env.bad"));
      await symlink(join(f.root, "elsewhere"), join(f.checkoutB.root, ".env.bad"));
      await atomicWrite(f.aStore, "TOKEN=neighbour\n");
      await push(f.first, f.opts);
      const reports: string[] = [];

      expect(
        (await pull(f.second, { ...f.opts, report: (message) => reports.push(message) })).conflicts,
      ).toBeGreaterThan(0);

      expect(await Bun.file(join(f.checkoutB.root, ".env")).text()).toBe("TOKEN=neighbour\n");
      expect(reports.some((message) => message.includes("Could not place"))).toBe(true);
      await push(f.second, f.opts);
    } finally {
      await f.cleanup();
    }
  });

test("keep-mine restores a removed link from its recorded store edit", async () => {
  const { resolveConflict } = await import("../resolve.ts");
  const f = await syncFixture();

  try {
    await pull(f.second, f.opts);
    await atomicWrite(f.aStore, "TOKEN=mine\n");
    await rm(join(f.checkout.root, ".env"));
    const second = (await loadState(f.second.home))!;
    await atomicWrite(second.links[0]!.store, "TOKEN=theirs\n");
    await push(f.second, f.opts);
    expect((await pull(f.first, f.opts)).conflicts).toBe(1);
    await resolveConflict(f.first, { file: ".env", choice: "keep-mine", now: f.now });
    await push(f.first, f.opts);
    await pull(f.second, f.opts);
    expect(await Bun.file(join(f.checkout.root, ".env")).text()).toBe("TOKEN=mine\n");
    expect(await Bun.file(second.links[0]!.store).text()).toBe("TOKEN=mine\n");
  } finally {
    await f.cleanup();
  }
});

for (const initial of [undefined, "TOKEN=local-test-value\n"])
  test(`a newly approved copy receives the shared store edit: initial=${initial !== undefined}`, async () => {
    const { mkdir } = await import("node:fs/promises");
    const { createFakeRepoAdapter } = await import("@envden/testing/repo");
    const { setConfig } = await import("../../settings/config.ts");
    const f = await syncFixture();

    try {
      const state = (await loadState(f.first.home))!;

      const copy = {
        ...f.checkout,
        root: join(f.root, "new-copy"),
        gitDir: join(f.root, "new-copy", ".git"),
      };

      await mkdir(copy.root);
      if (initial !== undefined) await atomicWrite(join(copy.root, ".env"), initial);
      state.approved.push(copy);
      await saveState(f.first.home, state);

      f.first.repo = createFakeRepoAdapter({
        checkoutAt: async (root) => (root === copy.root ? copy : f.checkout),
        caseInsensitive: async () => false,
        ensureIgnored: async () => {},
      });

      await setConfig("placement", JSON.stringify({ [copy.root]: "copy" }), f.first.home);
      await atomicWrite(f.aStore, "TOKEN=store-edit\n");
      expect((await pull(f.first, f.opts)).conflicts).toBe(0);
      expect(await Bun.file(f.aStore).text()).toBe("TOKEN=store-edit\n");
      expect(await Bun.file(join(copy.root, ".env")).text()).toBe("TOKEN=store-edit\n");
    } finally {
      await f.cleanup();
    }
  });
