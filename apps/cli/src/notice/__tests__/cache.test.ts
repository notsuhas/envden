import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyState } from "../../state/model.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { noticeStatus, refreshNotice, cachedNotice } from "../cache.ts";

test("notice lists approved changed repos without reading values into output", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-notice-"));

  try {
    const state = emptyState("test");
    state.approved.push({ root: "/repo", gitDir: "/repo/.git", repoId: "github.com/test/repo" });
    const store = join(home, "store", ".env");
    await atomicWrite(store, "SECRET=never-print\n");
    state.links.push({ root: "/repo", path: ".env", store, mode: "link" });
    expect(await noticeStatus(home, state)).toHaveLength(1);
    await refreshNotice(home, state);
    expect(await cachedNotice(home)).toBe("envden: github.com/test/repo out of sync\n");
    expect(await readFile(join(home, "state", "approved-checkouts"), "utf8")).toBe("/repo\n");
    state.links[0]!.localOnly = true;
    expect(await noticeStatus(home, state)).toEqual([]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("command notice honors environment opt-out without persisting it", async () => {
  const { commandNotice } = await import("../command.ts");
  const { saveState, loadState } = await import("../../state/store/repository.ts");
  const { createAdapters } = await import("../../adapters.ts");
  const { createMemoryKeychainAdapter } = await import("@envden/testing/keychain");
  const home = await mkdtemp(join(tmpdir(), "envden-notice-opt-"));
  const previous = process.env.ENVDEN_NO_UPDATE_CHECK;

  try {
    await saveState(home, emptyState("test"));
    process.env.ENVDEN_NO_UPDATE_CHECK = "1";
    const adapters = createAdapters({ home, keychain: createMemoryKeychainAdapter([]) });

    const result = await commandNotice(adapters, 100, async () => {
      throw new Error("Unexpected fetch");
    });

    expect(result.update.available).toBe(false);
    expect((await loadState(home))?.updateCheck).toBe(true);
    delete process.env.ENVDEN_NO_UPDATE_CHECK;

    await commandNotice(
      adapters,
      200,
      async () => {
        throw new Error("Shell refresh must not check releases");
      },
      true,
    );

    expect((await loadState(home))?.lastFeedCheck).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.ENVDEN_NO_UPDATE_CHECK;
    else process.env.ENVDEN_NO_UPDATE_CHECK = previous;

    await rm(home, { recursive: true, force: true });
  }
});

test("notice caches missed env checkouts and sanitized update text", async () => {
  const { cacheOffers } = await import("../offers.ts");
  const { createAdapters } = await import("../../adapters.ts");
  const { createMemoryKeychainAdapter } = await import("@envden/testing/keychain");
  const home = await mkdtemp(join(tmpdir(), "envden-offers-"));

  try {
    const adapters = createAdapters({
      home,
      userHome: home,
      keychain: createMemoryKeychainAdapter([]),
    });

    const checkout = {
      root: join(home, "repo"),
      gitDir: join(home, "repo", ".git"),
      repoId: "host/repo",
    };

    adapters.repo.checkoutAt = async () => checkout;
    adapters.repo.envFiles = async () => [".env"];
    const state = emptyState("test");
    await atomicWrite(join(home, "state", "track-offers"), "/bad\u001b[31m\n");
    await cacheOffers(adapters, state, checkout.root, { available: true, required: true });
    expect(await readFile(join(home, "state", "track-offers"), "utf8")).toBe(checkout.root + "\n");

    expect(await readFile(join(home, "state", "notice-update"), "utf8")).toContain(
      "update required",
    );

    state.approved.push(checkout);
    await cacheOffers(adapters, state, checkout.root, { available: false, required: false });
    expect(await readFile(join(home, "state", "track-offers"), "utf8")).toBe("");
    expect(await readFile(join(home, "state", "notice-update"), "utf8")).toBe("");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
