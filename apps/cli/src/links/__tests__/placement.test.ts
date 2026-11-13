import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createAdapters } from "../../adapters.ts";
import { emptyState } from "../../state/model.ts";
import { atomicWrite } from "../../state/files.ts";
import { linkCheckout } from "../place.ts";
import { markLocalOnly } from "../local-only.ts";

test("placement requires approval, relinks equal detached copies and preserves differing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-links-"));

  const adapters = createAdapters({
    home: join(root, "home"),
    userHome: root,
    keychain: createMemoryKeychainAdapter([]),
  });

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
    await atomicWrite(destination, "PORT=3000\n");
    await linkCheckout(adapters, state, checkout, async () => false);
    expect(state.links).toHaveLength(0);
    await linkCheckout(adapters, state, checkout, async () => true);
    expect(excludes).toBe(1);
    const link = state.links[0]!;
    await unlink(destination);
    await atomicWrite(destination, "PORT=3000\n");

    await linkCheckout(adapters, state, checkout, async () => {
      throw new Error("Repeated approval");
    });

    expect(await adapters.placement("link", checkout.root).inspect(link.store, destination)).toBe(
      "linked",
    );

    await atomicWrite(destination, "PORT=4000\n");
    await linkCheckout(adapters, state, checkout, async () => true);
    expect(await readFile(link.store, "utf8")).toBe("PORT=3000\n");
    await markLocalOnly(adapters, state, checkout.root, ".env");
    expect(link.localOnly).toBe(true);
    expect(await readFile(destination, "utf8")).toBe("PORT=4000\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
