import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createAdapters } from "../../adapters.ts";
import { emptyState } from "../../state/model.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { linkCheckout } from "../place.ts";

const fixtureClock = () => 1800000000000;

// the scan groups these by target to offer a takeover, or counts them in one summary line
test("a .env that is the user's own link is returned with its target, left alone and not printed", async () => {
  const { mkdir, readlink, realpath, symlink, writeFile } = await import("node:fs/promises");
  const root = await realpath(await mkdtemp(join(tmpdir(), "envden-own-link-")));
  const warnings: string[] = [];
  const original = console.error;
  console.error = (line: string) => warnings.push(line);

  const adapters = createAdapters(
    { home: join(root, "home"), userHome: root, keychain: createMemoryKeychainAdapter([]) },
    fixtureClock,
  );

  const checkout = {
    root: join(root, "checkout"),
    gitDir: join(root, "checkout", ".git"),
    repoId: "host/repo",
  };

  const destination = join(checkout.root, ".env");
  adapters.repo = createFakeRepoAdapter({ envFiles: async () => [".env"] });

  try {
    await mkdir(join(root, "shared"), { recursive: true });
    await mkdir(checkout.root, { recursive: true });
    await writeFile(join(root, "shared", ".env"), "SHARED=1\n");
    await symlink(join("..", "shared", ".env"), destination);
    const state = emptyState("test");
    const ownLinks = await linkCheckout(adapters, state, checkout, async () => true);

    expect(ownLinks).toEqual([
      {
        checkout,
        path: ".env",
        link: join("..", "shared", ".env"),
        target: join(root, "shared", ".env"),
      },
    ]);

    expect(state.links).toHaveLength(0);
    expect(await readlink(destination)).toBe(join("..", "shared", ".env"));
    expect(await readFile(join(root, "shared", ".env"), "utf8")).toBe("SHARED=1\n");
    expect(warnings).toEqual([]);
  } finally {
    console.error = original;
    await rm(root, { recursive: true, force: true });
  }
});

// ENVDEN_HOME -> dotfiles, and HOME itself reached through a link like /tmp -> /private/tmp
for (const linked of ["envden home", "user home"] as const)
  test(`linking works when the ${linked} is a symlink`, async () => {
    const { mkdir, realpath, symlink } = await import("node:fs/promises");
    const { saveState, loadState } = await import("../../state/store/repository.ts");
    const root = await realpath(await mkdtemp(join(tmpdir(), "envden-linked-home-")));

    try {
      await mkdir(join(root, "real", "dotfiles", "envden"), { recursive: true });
      await symlink(join(root, "real"), join(root, "home"));
      const userHome = linked === "user home" ? join(root, "home") : join(root, "real");

      const home =
        linked === "envden home" ? join(root, "home", ".envden") : join(userHome, ".envden");

      if (linked === "envden home")
        await symlink(join(root, "real", "dotfiles", "envden"), join(root, "real", ".envden"));

      const adapters = createAdapters(
        { home, userHome, keychain: createMemoryKeychainAdapter([]) },
        fixtureClock,
      );

      const checkout = {
        root: join(root, "real", "checkout"),
        gitDir: join(root, "real", "checkout", ".git"),
        repoId: "host/repo",
      };

      adapters.repo = createFakeRepoAdapter({
        envFiles: async () => [".env"],
        ensureIgnored: async () => {},
      });

      const destination = join(checkout.root, ".env");
      await atomicWrite(destination, "PORT=1\n", fixtureClock);
      const state = emptyState("test");
      await saveState(adapters.home, state, fixtureClock);
      await linkCheckout(adapters, state, checkout, async () => true);
      await saveState(adapters.home, state, fixtureClock);

      expect((await loadState(adapters.home))?.links).toHaveLength(1);
      expect((await lstat(destination)).isSymbolicLink()).toBe(true);

      expect(
        await adapters.placement("link", checkout.root).inspect(state.links[0]!.store, destination),
      ).toBe("linked");

      if (linked === "envden home")
        expect((await lstat(join(root, "real", ".envden"))).isSymbolicLink()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
