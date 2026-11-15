import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, unlink, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createAdapters } from "../../adapters.ts";
import { emptyState } from "../../state/model.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { linkCheckout } from "../place.ts";
import { markLocalOnly } from "../local-only.ts";

const fixtureClock = () => 1800000000000;

test("placement requires approval, relinks equal detached copies and preserves differing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-links-"));

  const adapters = createAdapters(
    {
      home: join(root, "home"),
      userHome: root,
      keychain: createMemoryKeychainAdapter([]),
    },
    fixtureClock,
  );

  const state = emptyState("test");

  const checkout = {
    root: join(root, "checkout"),
    gitDir: join(root, "checkout", ".git"),
    repoId: "host/repo",
  };

  let excludes = 0;

  adapters.repo = createFakeRepoAdapter({
    envFiles: async () => [".env"],
    ensureIgnored: async () => {
      excludes++;
    },
  });

  const destination = join(checkout.root, ".env");

  try {
    await atomicWrite(destination, "PORT=3000\n", fixtureClock);
    await linkCheckout(adapters, state, checkout, async () => false);
    expect(state.links).toHaveLength(0);
    await linkCheckout(adapters, state, checkout, async () => true);
    expect(excludes).toBe(1);
    const link = state.links[0]!;
    await unlink(destination);
    await atomicWrite(destination, "PORT=3000\n", fixtureClock);

    await linkCheckout(adapters, state, checkout, async () => {
      throw new Error("Repeated approval");
    });

    expect(await adapters.placement("link", checkout.root).inspect(link.store, destination)).toBe(
      "linked",
    );

    await atomicWrite(destination, "PORT=4000\n", fixtureClock);
    await linkCheckout(adapters, state, checkout, async () => true);
    expect(await readFile(link.store, "utf8")).toBe("PORT=3000\n");
    await markLocalOnly(adapters, state, checkout.root, ".env");
    expect(link.localOnly).toBe(true);
    expect(await readFile(destination, "utf8")).toBe("PORT=4000\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("container offers are recorded once per checkout", async () => {
  const { checkoutPlacement } = await import("../checkout/mode.ts");
  const root = await mkdtemp(join(tmpdir(), "envden-copy-"));

  const adapters = createAdapters(
    {
      home: join(root, "home"),
      userHome: root,
      keychain: createMemoryKeychainAdapter([]),
    },
    fixtureClock,
  );

  const checkout = {
    root: join(root, "checkout"),
    gitDir: join(root, "checkout", ".git"),
    repoId: "host/repo",
  };

  try {
    await atomicWrite(join(checkout.root, ".env"), "A=1", fixtureClock);
    await atomicWrite(join(checkout.root, "Dockerfile"), "FROM scratch", fixtureClock);
    let offered = 0;

    const ask = async () => {
      offered++;

      return false;
    };

    expect(await checkoutPlacement(adapters, checkout.root, false, ask, true)).toBe("link");
    expect(await checkoutPlacement(adapters, checkout.root, false, ask, true)).toBe("link");
    expect(offered).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("copy flags and mode switches preserve checkout bases", async () => {
  const { readConfig, setConfig } = await import("../../settings/config.ts");
  const root = await mkdtemp(join(tmpdir(), "envden-copy-"));

  const adapters = createAdapters(
    {
      home: join(root, "home"),
      userHome: root,
      keychain: createMemoryKeychainAdapter([]),
    },
    fixtureClock,
  );

  const checkout = {
    root: join(root, "checkout"),
    gitDir: join(root, "checkout", ".git"),
    repoId: "host/repo",
  };

  try {
    await atomicWrite(join(checkout.root, ".env"), "A=1", fixtureClock);
    await atomicWrite(join(checkout.root, "Dockerfile"), "FROM scratch", fixtureClock);
    const rules = { include: [".env"], exclude: [], extraSkipped: ["generated"] };
    await setConfig("env-files", JSON.stringify(rules), adapters.home, () => 0);

    adapters.repo = createFakeRepoAdapter({
      checkoutAt: async () => checkout,
      envFiles: async (_checkout, options) => {
        expect(options).toEqual(rules);

        return [".env"];
      },
      ensureIgnored: async () => {},
    });

    const state = emptyState("test");
    await linkCheckout(adapters, state, checkout, async () => true, true);
    expect(state.links[0]?.mode).toBe("copy");
    expect((await lstat(join(checkout.root, ".env"))).isSymbolicLink()).toBe(false);
    expect((await readConfig(adapters.home)).placement?.[checkout.root]).toBe("copy");
    const { setCheckoutPlacement } = await import("../../settings/placement.ts");
    adapters.repo.checkoutAt = async () => checkout;
    await setCheckoutPlacement(adapters, join(checkout.root, "nested"), "link");
    await linkCheckout(adapters, state, checkout, async () => true);
    expect(state.links[0]?.mode).toBe("link");
    const { basePath } = await import("../../sync/local/files.ts");
    const store = state.links[0]!.store;
    await atomicWrite(basePath(adapters.home, store), "A=1", fixtureClock);
    await setCheckoutPlacement(adapters, checkout.root, "copy");
    await linkCheckout(adapters, state, checkout, async () => true);
    expect(await readFile(basePath(adapters.home, store, checkout.root), "utf8")).toBe("A=1");
    await setCheckoutPlacement(adapters, checkout.root, "link");
    await linkCheckout(adapters, state, checkout, async () => true);
    expect((await lstat(join(checkout.root, ".env"))).isSymbolicLink()).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const interactive of [false, true])
  test(`unavailable links require explicit copy consent: interactive=${interactive}`, async () => {
    const { supportedPlacement } = await import("../checkout/supported.ts");
    const { readConfig } = await import("../../settings/config.ts");
    const root = await mkdtemp(join(tmpdir(), "envden-unsupported-"));

    const adapters = createAdapters(
      {
        home: join(root, "home"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    const placement = adapters.placement;

    adapters.placement = (mode, checkout) => ({
      ...placement(mode, checkout),
      supported: async () => false,
    });

    try {
      await Promise.resolve(
        expect(
          supportedPlacement(adapters, root, false, async () => false, interactive),
        ).rejects.toMatchObject({ code: "INVALID_INPUT" }),
      );

      expect((await readConfig(adapters.home)).placement?.[root]).toBeUndefined();

      if (interactive) {
        expect((await supportedPlacement(adapters, root, false, async () => true, true)).mode).toBe(
          "copy",
        );

        expect((await readConfig(adapters.home)).placement?.[root]).toBe("copy");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
