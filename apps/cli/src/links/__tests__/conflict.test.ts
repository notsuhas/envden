import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { emptyState } from "../../state/model.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { storePath } from "../../store/path.ts";
import { linkFile } from "../file.ts";

const fixtureClock = () => 1800000000000;

for (const choice of ["separate", "store", "skip"] as const)
  test(`file conflict choice: ${choice}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-choice-"));

    try {
      const adapters = createAdapters(
        {
          home: join(root, "home"),
          userHome: root,
          keychain: createMemoryKeychainAdapter([]),
        },
        fixtureClock,
      );

      adapters.repo.ensureIgnored = async () => {};

      const checkout = {
        root: join(root, "checkout"),
        gitDir: join(root, "checkout", ".git"),
        repoId: "host/repo",
      };

      const store = storePath(adapters.home, checkout.repoId, ".env");
      await atomicWrite(store, "PORT=1", fixtureClock);
      const destination = join(checkout.root, ".env");
      await atomicWrite(destination, "PORT=2", fixtureClock);
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

test("link refuses oversized files without creating a store entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-size-"));

  try {
    const adapters = createAdapters(
      {
        home: join(root, "home"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    adapters.repo.ensureIgnored = async () => {};
    const checkout = { root, gitDir: join(root, ".git"), repoId: "host/repo" };
    await atomicWrite(join(root, ".env"), new Uint8Array(1048577), fixtureClock);
    const state = emptyState("test");
    await linkFile(adapters, state, checkout, adapters.placement("link", root), ".env");
    expect(state.links).toHaveLength(0);
    expect(await Bun.file(storePath(adapters.home, checkout.repoId, ".env")).exists()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
