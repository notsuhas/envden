import { removeFile } from "../remove.ts";
import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { setConfig } from "../../settings/config.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { linkCheckout } from "../../links/place.ts";
import { setupVault } from "../../vault/setup.ts";
import { pushInitialFiles } from "../../vault/initial/push.ts";
import { pull, push } from "../engine.ts";
import { createSharedFixture } from "./shared-fixture.ts";

const syncFixture = createSharedFixture();

for (const scenario of ["revert", "unpublished", "two copies"] as const)
  test(`copy push preserves edits: ${scenario}`, async () => {
    const f = await syncFixture();

    try {
      await setConfig("placement", JSON.stringify({ [f.checkoutB.root]: "copy" }), f.second.home);
      await pull(f.second, f.opts);
      const path = join(f.checkoutB.root, scenario === "unpublished" ? ".env.new" : ".env");

      if (scenario === "unpublished") {
        await atomicWrite(path, "A=1\n");
        const state = (await loadState(f.second.home))!;
        f.second.repo.envFiles = async () => [".env.new"];
        await linkCheckout(f.second, state, f.checkoutB, async () => true, true);
        await saveState(f.second.home, state);
      } else if (scenario === "revert") {
        await atomicWrite(path, "A=1\n");
        await push(f.second, f.opts);
      } else {
        const state = (await loadState(f.second.home))!;
        const checkout = { ...f.checkoutB, root: join(f.root, "copy-two") };
        await atomicWrite(join(checkout.root, ".env"), await Bun.file(path).text());
        f.second.repo.envFiles = async () => [".env"];
        await linkCheckout(f.second, state, checkout, async () => true, true);
        await saveState(f.second.home, state);
        await pull(f.second, f.opts);
        await atomicWrite(join(checkout.root, ".env"), "A=2\n");
        expect((await push(f.second, f.opts)).kind).toBe("pushed");

        return;
      }

      await atomicWrite(path, "A=2\n");
      expect((await push(f.second, f.opts)).kind).toBe("pushed");

      if (scenario === "revert") {
        await atomicWrite(path, "A=1\n");
        expect((await push(f.second, f.opts)).kind).toBe("pushed");
        expect(await Bun.file(path).text()).toBe("A=1\n");
      }
    } finally {
      await f.cleanup();
    }
  });

test("rerunning setup file push leaves remote edits for normal reconciliation", async () => {
  const f = await syncFixture();

  try {
    await pull(f.second, f.opts);
    const b = (await loadState(f.second.home))!;
    await atomicWrite(b.links[0]!.store, "TOKEN=remote-new\n");
    await push(f.second, f.opts);
    const resumed = await setupVault(f.first, f.setupOptions);
    await pushInitialFiles(f.first, resumed.state, f.now);
    await pull(f.first, f.opts);
    expect(await Bun.file(f.aStore).text()).toBe("TOKEN=remote-new\n");
    await push(f.first, f.opts);
    await pull(f.second, f.opts);
    expect(await Bun.file(b.links[0]!.store).text()).toBe("TOKEN=remote-new\n");
  } finally {
    await f.cleanup();
  }
});

test("newly tracked copy cannot resurrect a server tombstone", async () => {
  const f = await syncFixture();

  try {
    await removeFile(f.first, join(f.checkout.root, ".env"), { yes: true, now: f.now });
    await push(f.first, f.opts);
    await atomicWrite(join(f.checkoutB.root, ".env"), "TOKEN=stale\n");
    const state = (await loadState(f.second.home))!;
    f.second.repo.envFiles = async () => [".env"];
    await linkCheckout(f.second, state, f.checkoutB, async () => true, true);
    await saveState(f.second.home, state);
    expect((await push(f.second, f.opts)).kind).toBe("conflict");
    expect(await Bun.file(join(f.checkoutB.root, ".env")).text()).toBe("TOKEN=stale\n");
  } finally {
    await f.cleanup();
  }
});

test("cancel at detached prompt aborts push", async () => {
  const { PromptCancelled } = await import("../../state/cancelled.ts");
  const f = await syncFixture();

  try {
    const path = join(f.checkout.root, ".env");
    await rm(path);
    await atomicWrite(path, "TOKEN=detached\n");

    await Promise.resolve(
      expect(
        push(f.first, {
          ...f.opts,
          interactive: true,
          choose: async () => {
            throw new PromptCancelled();
          },
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );
  } finally {
    await f.cleanup();
  }
});

test("all skips a recreated checkout even when another checkout selects its repo", async () => {
  const { mkdir } = await import("node:fs/promises");
  const { createFakeRepoAdapter } = await import("@envden/testing/repo");
  const f = await syncFixture();

  try {
    const state = (await loadState(f.second.home))!;

    const other = {
      ...f.checkoutB,
      root: join(f.root, "approved-other"),
      gitDir: join(f.root, "approved-other", ".git"),
    };

    await mkdir(other.root);
    state.approved.push(other);
    await saveState(f.second.home, state);

    f.second.repo = createFakeRepoAdapter({
      checkoutAt: async (root) =>
        root === other.root ? other : { ...f.checkoutB, identity: "recreated" },
      caseInsensitive: async () => false,
      ensureIgnored: async () => {},
    });

    await pull(f.second, f.opts);
    expect(await Bun.file(join(other.root, ".env")).exists()).toBe(true);
    expect(await Bun.file(join(f.checkoutB.root, ".env")).exists()).toBe(false);
  } finally {
    await f.cleanup();
  }
});
