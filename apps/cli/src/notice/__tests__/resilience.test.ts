import { test, expect, spyOn } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncFixture } from "../../sync/__tests__/flows.ts";
import { commandNotice } from "../command.ts";
import { readRemoteNotice } from "../remote.ts";
import { reportPendingJoins } from "../pending.ts";
import { cacheOffers } from "../offers.ts";
import { readUpdateCache } from "../../updates/cache.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { createAdapters } from "../../adapters.ts";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { emptyState } from "../../state/model.ts";

test("a server consuming its deadline leaves a fresh deadline for GitHub", async () => {
  const f = await syncFixture();
  const controller = new AbortController();
  const timeout = spyOn(AbortSignal, "timeout").mockImplementation(() => controller.signal);
  const before = process.env.ENVDEN_NO_UPDATE_CHECK;
  delete process.env.ENVDEN_NO_UPDATE_CHECK;
  let github = 0;

  try {
    await commandNotice(f.second, f.now(), async (input) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url.includes("github.com")) {
        github++;

        return Response.json({ tag_name: "v99.0.0" });
      }

      controller.abort();
      timeout.mockImplementation(() => new AbortController().signal);
      throw new Error("server deadline");
    });

    expect(github).toBeGreaterThan(0);
    expect((await readUpdateCache(f.second.home)).latest).toBe("99.0.0");
  } finally {
    timeout.mockRestore();

    if (before === undefined) delete process.env.ENVDEN_NO_UPDATE_CHECK;
    else process.env.ENVDEN_NO_UPDATE_CHECK = before;

    await f.cleanup();
  }
});

test("corrupt notice caches are absent and scan history is bounded", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-notice-resilience-"));

  try {
    await atomicWrite(join(home, "state", "remote-notice.json"), "{");
    await atomicWrite(join(home, "state", "pending-recovery.json"), "null");
    expect(await readRemoteNotice(home)).toBeUndefined();
    await reportPendingJoins(home);

    const adapters = createAdapters({
      home,
      userHome: home,
      keychain: createMemoryKeychainAdapter([]),
    });

    const checkout = { root: "/checkout", gitDir: "/checkout/.git", repoId: "host/repo" };
    adapters.repo.checkoutAt = async () => checkout;
    adapters.repo.envFiles = async () => [];

    await atomicWrite(
      join(home, "state", "track-scanned.json"),
      JSON.stringify(Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`/old/${i}`, i]))),
    );

    await cacheOffers(
      adapters,
      emptyState("test"),
      checkout.root,
      { available: false, required: false },
      100000,
    );

    const scans = JSON.parse(await readFile(join(home, "state", "track-scanned.json"), "utf8"));
    expect(scans).toEqual({ "/checkout": 100000 });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
