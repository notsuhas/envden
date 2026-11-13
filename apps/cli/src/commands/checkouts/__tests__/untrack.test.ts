import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../../adapters.ts";
import { emptyState } from "../../../state/model.ts";
import { atomicWrite } from "../../../state/files.ts";
import { saveState, loadState } from "../../../state/repository.ts";
import { untrack } from "../untrack.ts";

for (const mode of ["link", "copy"] as const)
  test(`untrack preserves ${mode} files and removes approval`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-untrack-"));

    try {
      const checkout = {
        root: join(root, "checkout"),
        gitDir: join(root, "checkout", ".git"),
        repoId: "host/repo",
      };

      const adapters = createAdapters({
        home: join(root, "home"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      });

      const store = join(adapters.home, "store", ".env");
      const destination = join(checkout.root, ".env");
      await atomicWrite(store, "PORT=1");
      await atomicWrite(destination, "PORT=1");
      await adapters.placement(mode, checkout.root).place(store, destination);
      if (mode === "copy") await atomicWrite(destination, "PORT=2");
      const state = emptyState("test");
      state.approved.push(checkout);
      state.links.push({ root: checkout.root, path: ".env", store, mode });
      await saveState(adapters.home, state);
      await untrack(adapters, checkout.root);
      expect((await lstat(destination)).isSymbolicLink()).toBe(false);
      expect(await readFile(destination, "utf8")).toBe(mode === "copy" ? "PORT=2" : "PORT=1");
      expect(await readFile(store, "utf8")).toBe("PORT=1");
      expect((await loadState(adapters.home))?.approved).toEqual([]);
      expect((await loadState(adapters.home))?.links).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
