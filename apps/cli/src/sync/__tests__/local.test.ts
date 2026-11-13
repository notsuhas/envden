import { test, expect } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createAdapters } from "../../adapters.ts";
import { atomicWrite } from "../../state/files.ts";
import { emptyState } from "../../state/model.ts";
import { basePath, readBytes, same, withSyncLock } from "../local/files.ts";
import { selectedRepos } from "../local/selection.ts";
import { conflictRecords, saveConflicts } from "../local/conflicts.ts";
import { resolveConflict } from "../resolve.ts";

const bytes = (value: string) => new TextEncoder().encode(value);

test("bases distinguish copies, fit long paths, and reads refuse symlinks", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-sync-"));

  try {
    const store = join(home, "store", "long".repeat(100));
    expect(basePath(home, store).split("/").at(-1)!.length).toBeLessThan(100);
    expect(basePath(home, store, "a")).not.toBe(basePath(home, store, "b"));
    expect(same(undefined, bytes(""))).toBe(false);
    expect(same(bytes("x"), bytes("x"))).toBe(true);
    await atomicWrite(join(home, "file"), "secret");
    await symlink(join(home, "file"), join(home, "link"));
    expect(readBytes(join(home, "link"))).rejects.toMatchObject({ code: "INVALID_DATA" });
    expect(await readBytes(join(home, "missing"))).toBeUndefined();

    await withSyncLock(home, async () => {
      try {
        await withSyncLock(home, async () => {});
        throw new Error("Lock was not held");
      } catch (error) {
        expect(error).toMatchObject({ code: "CONFLICT" });
      }
    });

    await withSyncLock(home, async () => {});
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("repo selection refuses changed remotes and path-prefix siblings", async () => {
  const checkout = {
    root: "/projects/repo",
    gitDir: "/projects/repo/.git",
    repoId: "github.com/test/repo",
  };

  const adapters = createAdapters({ home: "/unused", keychain: createMemoryKeychainAdapter([]) });
  adapters.repo = createFakeRepoAdapter({ checkoutAt: async () => checkout });
  const state = emptyState("test");
  state.approved.push(checkout);
  const options = { now: () => 1, fetcher: fetch, cwd: "/projects/repo/nested" };
  expect([...(await selectedRepos(adapters, state, options))]).toEqual([checkout.repoId]);

  expect(
    selectedRepos(adapters, state, { ...options, cwd: "/projects/repo-other" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

  adapters.repo = createFakeRepoAdapter({
    checkoutAt: async () => ({ ...checkout, repoId: "changed" }),
  });

  expect(selectedRepos(adapters, state, { ...options, all: true })).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

for (const choice of ["keep-mine", "take-server", "edit"] as const) {
  test(`resolve ${choice} keeps the server base and clears only its conflict`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-resolve-"));
    const adapters = createAdapters({ home, keychain: createMemoryKeychainAdapter([]) });

    try {
      const store = join(home, "store", ".env");
      const file = join(home, "conflicts", "edited");
      const server = file + ".server";
      const base = join(home, "base", "one");
      await atomicWrite(store, "KEY=mine\n");
      await atomicWrite(file, "KEY=edited\n");
      await atomicWrite(server, "KEY=remote\n");
      await atomicWrite(file + ".mine", "KEY=mine\n");

      await saveConflicts(home, [
        {
          store,
          root: home,
          path: ".env",
          mode: "copy",
          file,
          server,
          mine: file + ".mine",
          base,
          deleted: false,
          mineDeleted: false,
        },
      ]);

      await resolveConflict(adapters, { choice });

      expect(new TextDecoder().decode(await readBytes(store))).toBe(
        choice === "take-server"
          ? "KEY=remote\n"
          : choice === "keep-mine"
            ? "KEY=mine\n"
            : "KEY=edited\n",
      );

      expect(new TextDecoder().decode(await readBytes(base))).toBe("KEY=remote\n");
      expect(await conflictRecords(home)).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("backup retention removes only expired backup names", async () => {
  const { pruneBackups } = await import("../local/retention.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-retention-"));

  try {
    const directory = join(home, "conflicts", "backups");
    await atomicWrite(join(directory, "1-abc"), "old");
    await atomicWrite(join(directory, "2592000001-abc"), "new");
    await atomicWrite(join(directory, "unrecognized"), "keep");
    await pruneBackups(home, 2592000001);
    expect(await readBytes(join(directory, "1-abc"))).toBeUndefined();
    expect(await readBytes(join(directory, "2592000001-abc"))).toBeDefined();
    expect(await readBytes(join(directory, "unrecognized"))).toBeDefined();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("repair hazards survive a scoped pull until a conflict is saved", async () => {
  const { pendingRepairs, savePendingRepairs, consumeRepair } =
    await import("../remote/repairs.ts");

  const home = await mkdtemp(join(tmpdir(), "envden-pending-repair-"));

  try {
    await savePendingRepairs(home, new Set(["repo-a", "repo-b"]));
    await consumeRepair(home, "repo-a");
    expect([...(await pendingRepairs(home))]).toEqual(["repo-b"]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
