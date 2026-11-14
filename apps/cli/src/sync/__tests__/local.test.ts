import { test, expect } from "bun:test";
import { mkdtemp, rm, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createAdapters } from "../../adapters.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { emptyState } from "../../state/model.ts";
import { basePath, readBytes, same, withSyncLock } from "../local/files.ts";
import { selectedRepos } from "../local/selection.ts";
import { conflictRecords, saveConflicts } from "../local/conflicts.ts";
import { resolveConflict } from "../resolve.ts";

const bytes = (value: string) => new TextEncoder().encode(value);

test("base paths distinguish copies and fit long paths", () => {
  const home = "/test/home";
  const store = join(home, "store", "long".repeat(100));
  expect(basePath(home, store).split("/").at(-1)!.length).toBeLessThan(100);
  expect(basePath(home, store, "a")).not.toBe(basePath(home, store, "b"));
  expect(same(undefined, bytes(""))).toBe(false);
  expect(same(bytes("x"), bytes("x"))).toBe(true);
});

test("local reads reject symlinks and distinguish missing files", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-read-"));

  try {
    await atomicWrite(join(home, "file"), "secret");

    if (process.platform !== "win32") {
      await symlink(join(home, "file"), join(home, "link"));

      await Promise.resolve(
        expect(readBytes(join(home, "link"))).rejects.toMatchObject({ code: "INVALID_DATA" }),
      );
    }

    expect(await readBytes(join(home, "missing"))).toBeUndefined();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("sync locks nest and release between writers", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-sync-lock-"));

  try {
    expect(await withSyncLock(home, async () => withSyncLock(home, async () => "nested"))).toBe(
      "nested",
    );

    await withSyncLock(home, async () => {});
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("repo selection refuses changed remotes and path-prefix siblings", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "envden-selection-"));

  const checkout = {
    root: fixture,
    gitDir: join(fixture, ".git"),
    repoId: "github.com/test/repo",
  };

  const adapters = createAdapters({
    home: join(fixture, "home"),
    userHome: fixture,
    keychain: createMemoryKeychainAdapter([]),
  });

  adapters.repo = createFakeRepoAdapter({ checkoutAt: async () => checkout });
  const state = emptyState("test");
  state.approved.push(checkout);
  const options = { now: () => 1, fetcher: fetch, cwd: join(fixture, "nested") };
  expect([...(await selectedRepos(adapters, state, options))]).toEqual([checkout.repoId]);

  await Promise.resolve(
    expect(
      selectedRepos(adapters, state, { ...options, cwd: fixture + "-other" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" }),
  );

  adapters.repo = createFakeRepoAdapter({
    checkoutAt: async () => ({ ...checkout, repoId: "changed" }),
  });

  await Promise.resolve(
    expect(selectedRepos(adapters, state, { ...options, all: true })).rejects.toMatchObject({
      code: "CONFLICT",
    }),
  );

  await rm(fixture, { recursive: true, force: true });
});

for (const choice of ["keep-mine", "take-server", "edit"] as const) {
  test(`resolve ${choice} keeps the server base and clears only its conflict`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-resolve-"));

    const adapters = createAdapters({
      home,
      userHome: home,
      keychain: createMemoryKeychainAdapter([]),
    });

    const checkout = join(home, "checkout");

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
          root: checkout,
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

      await atomicWrite(join(checkout, ".env"), "unrelated checkout bytes");
      await resolveConflict(adapters, { choice, now: () => 10 });
      const backups = await readdir(join(home, "conflicts", "backups"));

      expect(
        await Promise.all(
          backups.map(async (name) =>
            new TextDecoder().decode(await readBytes(join(home, "conflicts", "backups", name))),
          ),
        ),
      ).toContain("unrelated checkout bytes");

      expect(new TextDecoder().decode(await readBytes(store))).toBe(
        choice === "take-server"
          ? "KEY=remote\n"
          : choice === "keep-mine"
            ? "unrelated checkout bytes"
            : "KEY=edited\n",
      );

      expect(new TextDecoder().decode(await readBytes(base))).toBe("KEY=remote\n");
      expect(await conflictRecords(home)).toEqual([]);

      for (const path of [file, server, file + ".mine"])
        expect(await readBytes(path)).toBeUndefined();
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

test("alias refuses existing placed files before changing their identity", async () => {
  const { aliasUnlinkedRepo } = await import("../alias.ts");
  const { saveState, loadState } = await import("../../state/store/repository.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-alias-"));

  try {
    const state = emptyState("test");
    state.approved.push({ root: home, gitDir: join(home, ".git"), repoId: "source" });
    state.links.push({ root: home, path: ".env", store: join(home, "store"), mode: "copy" });
    await saveState(home, state);

    await Promise.resolve(
      expect(
        aliasUnlinkedRepo(
          createAdapters({ home, userHome: home, keychain: createMemoryKeychainAdapter([]) }),
          "source",
          "target",
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" }),
    );

    expect((await loadState(home))?.aliases).toEqual({});
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
