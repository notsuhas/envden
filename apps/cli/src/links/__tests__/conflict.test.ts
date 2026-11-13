import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { emptyState } from "../../state/model.ts";
import { atomicWrite } from "../../state/files.ts";
import { storePath } from "../../store/path.ts";
import { linkFile } from "../file.ts";

for (const choice of ["separate", "store", "skip"] as const)
  test(`file conflict choice: ${choice}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-choice-"));

    try {
      const adapters = createAdapters({
        home: join(root, "home"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      });

      adapters.repo.ensureIgnored = async () => {};

      const checkout = {
        root: join(root, "checkout"),
        gitDir: join(root, "checkout", ".git"),
        repoId: "host/repo",
      };

      const store = storePath(adapters.home, checkout.repoId, ".env");
      await atomicWrite(store, "PORT=1");
      const destination = join(checkout.root, ".env");
      await atomicWrite(destination, "PORT=2");
      const state = emptyState("test");

      await linkFile(
        adapters,
        state,
        checkout,
        adapters.placement("link", checkout.root),
        ".env",
        async () => choice,
      );

      expect(await readFile(destination, "utf8")).toBe(choice === "store" ? "PORT=1" : "PORT=2");
      expect(await readFile(store, "utf8")).toBe("PORT=1");
      expect(state.links.length).toBe(choice === "skip" ? 0 : 1);

      if (choice === "separate")
        expect(state.links[0]).toMatchObject({ mode: "copy", localOnly: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
