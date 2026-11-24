import { test, expect } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { loadState } from "../../state/store/repository.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { linkCheckout } from "../../links/place.ts";
import { appliedFiles } from "../../sync/local/applied.ts";
import { fixture } from "../../admin/recovery/__tests__/fixture.ts";
import { pushInitialFiles } from "../initial/push.ts";
import { setupVault } from "../setup.ts";
import { recoveryJoin } from "../recovery/join.ts";
import { setupFlow } from "./setup-flow.ts";

test("setup resumes after losing the creation response and replaces the unseen code at once", async () => {
  const flow = await setupFlow();

  try {
    expect((await loadState(flow.first.home))?.creationPending).toBeUndefined();

    const joined = await recoveryJoin(flow.second, {
      address: flow.address,
      code: flow.code,
      name: "second",
      now: flow.now,
      fetcher: flow.fetcher,
    });

    expect(joined.vaultId).toBe(flow.result.state.vaultId);
  } finally {
    await flow.cleanup();
  }
});

test("a recovery join works after a failed setup with an already used token", async () => {
  const flow = await setupFlow();

  try {
    await Promise.resolve(
      expect(
        setupVault(flow.second, {
          address: flow.address,
          token: flow.token,
          name: "second",
          now: flow.now,
          fetcher: flow.fetcher,
          onCode: async () => {},
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
    );

    await flow.second.keychain.set(`envden/${flow.second.home}/id-key`, new Uint8Array(32));

    await recoveryJoin(flow.second, {
      address: flow.address,
      code: flow.code,
      name: "second",
      now: flow.now,
      fetcher: flow.fetcher,
    });

    expect((await loadState(flow.second.home))?.vaultId).toBe(flow.result.state.vaultId);
  } finally {
    await flow.cleanup();
  }
});

test("setup does not re-record file baselines after another manifest commit", async () => {
  const f = await fixture();

  try {
    const checkout = {
      root: join(f.root, "checkout"),
      gitDir: join(f.root, "checkout", ".git"),
      repoId: "github.com/example/project",
    };

    await atomicWrite(join(checkout.root, ".env"), "TOKEN=local-test-value\n", f.now);

    f.first.repo = createFakeRepoAdapter({
      envFiles: async () => [".env"],
      ensureIgnored: async () => {},
    });

    await linkCheckout(f.first, f.result.state, checkout, async () => true);
    await pushInitialFiles(f.first, f.result.state, f.now);
    expect(Object.keys(await appliedFiles(f.first.home))).toHaveLength(1);
    await f.joinHome("second");
    await rm(join(f.first.home, "state", "applied-files.json"));
    await pushInitialFiles(f.first, (await loadState(f.first.home))!, f.now);
    expect(Object.keys(await appliedFiles(f.first.home))).toHaveLength(0);
  } finally {
    await f.close();
  }
});
