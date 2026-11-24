import { isToken } from "@envden/core/protocol";
import { spyOn } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testNetwork } from "@envden/server/testing";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { setupVault } from "../../vault/setup.ts";
import { recoveryJoin } from "../../vault/recovery/join.ts";
import { linkCheckout } from "../../links/place.ts";
import { pushInitialFiles } from "../../vault/initial/push.ts";
import { saveState, loadState } from "../../state/store/repository.ts";
import { atomicWrite } from "../../state/store/files.ts";

const fixtureClock = () => 1800000000000;

export async function syncFixture(directory?: string) {
  const root = directory ?? (await mkdtemp(join(tmpdir(), "envden-sync-")));
  const now = fixtureClock;
  const log = spyOn(console, "log").mockImplementation(() => {});
  const { serve, fetcher } = testNetwork();
  const running = await serve({ dataDir: join(root, "server"), port: 0, now });

  const token = log.mock.calls.flat().find((value) => isToken("setup", value));

  log.mockRestore();

  const cleanup = async () => {
    await running.shutdown();
    await rm(root, { recursive: true, force: true });
  };

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");

    const homes = ["first", "second", "third"].map((name) =>
      createAdapters(
        {
          fetcher,
          home: join(root, name),
          userHome: join(root, name),
          keychain: createMemoryKeychainAdapter(["get", "set", "delete"]),
        },
        now,
      ),
    );

    const first = homes[0]!,
      second = homes[1]!,
      third = homes[2]!;

    const address = running.server.url.toString();

    let code = "";

    const result = await setupVault(first, {
      address,
      token,
      name: "first",
      now,
      fetcher,
      onCode: async (shown) => {
        code = shown;
      },
    });

    const checkout = {
      root: join(root, "checkout"),
      gitDir: join(root, "checkout", ".git"),
      repoId: "github.com/example/project",
    };

    await atomicWrite(join(checkout.root, ".env"), "TOKEN=local-test-value\n", now);

    first.repo = createFakeRepoAdapter({
      caseInsensitive: async () => false,
      checkoutAt: async () => checkout,
      envFiles: async () => [".env"],
      ensureIgnored: async () => {},
    });

    await linkCheckout(first, result.state, checkout, async () => true);
    await pushInitialFiles(first, result.state, now);

    for (const [adapters, name] of [
      [second, "second"],
      [third, "third"],
    ] as const)
      await recoveryJoin(adapters, { address, code, name, now, fetcher });

    const checkoutB = {
      ...checkout,
      root: join(root, "checkout-b"),
      gitDir: join(root, "checkout-b", ".git"),
    };

    second.repo = createFakeRepoAdapter({
      caseInsensitive: async () => false,
      checkoutAt: async () => checkoutB,
      ensureIgnored: async () => {},
    });

    await mkdir(checkoutB.root, { recursive: true });
    const bState = (await loadState(second.home))!;
    bState.approved.push(checkoutB);
    await saveState(second.home, bState, now);

    return {
      serve: (options: Parameters<typeof serve>[0]) =>
        serve({ ...options, now: options?.now ?? now }),
      fetcher,
      first,
      second,
      third,
      checkout,
      checkoutB,
      aStore: result.state.links[0]!.store,
      setupOptions: { address, token, name: "first", now, fetcher, onCode: async () => {} },
      root,
      now,
      cleanup,
      opts: { now, fetcher, all: true, yes: true },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
