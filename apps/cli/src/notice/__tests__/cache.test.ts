import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyState } from "../../state/model.ts";
import { atomicWrite } from "../../state/files.ts";
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
  const { saveState, loadState } = await import("../../state/repository.ts");
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
