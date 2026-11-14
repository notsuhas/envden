import { spyOn } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testNetwork } from "@envden/server/testing";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { setupVault } from "../../vault/setup.ts";
import { kitJoin } from "../../vault/recovery/kit.ts";
import { linkCheckout } from "../../links/place.ts";
import { pushInitialFiles } from "../../vault/initial/push.ts";
import { saveState, loadState } from "../../state/store/repository.ts";
import { atomicWrite } from "../../state/store/files.ts";

export async function syncFixture(directory?: string) {
  const root = directory ?? (await mkdtemp(join(tmpdir(), "envden-sync-")));
  const now = () => 1800000000000;
  const log = spyOn(console, "log").mockImplementation(() => {});
  const { serve, fetcher } = testNetwork();
  const running = await serve({ dataDir: join(root, "server"), port: 0, now });

  const token = log.mock.calls
    .flat()
    .find((value) => typeof value === "string" && value.startsWith("envden-setup-1:"));

  log.mockRestore();

  const cleanup = async () => {
    await running.server.stop(true);
    running.storage.close();
    running.stopPruning();
    await rm(root, { recursive: true, force: true });
  };

  try {
    if (typeof token !== "string") throw new Error("Missing setup token");

    const homes = ["first", "second", "third"].map((name) =>
      createAdapters({
        fetcher,
        home: join(root, name),
        userHome: join(root, name),
        keychain: createMemoryKeychainAdapter(["get", "set", "delete"]),
      }),
    );

    const first = homes[0]!,
      second = homes[1]!,
      third = homes[2]!;

    const address = running.server.url.toString();

    const result = await setupVault(first, {
      address,
      token,
      name: "first",
      password: "master password",
      now,
      fetcher,
    });

    const checkout = {
      root: join(root, "checkout"),
      gitDir: join(root, "checkout", ".git"),
      repoId: "github.com/example/project",
    };

    await atomicWrite(join(checkout.root, ".env"), "TOKEN=local-test-value\n");

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
      await kitJoin(adapters, {
        address,
        vaultId: result.kit.vaultId,
        secretKey: result.kit.secretKey,
        password: "master password",
        name,
        now,
        fetcher,
      });

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
    await saveState(second.home, bState);

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
      setupOptions: {
        address,
        token,
        name: "first",
        password: "master password",
        now,
        fetcher,
        resumeSecretKey: result.kit.secretKey,
      },
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
