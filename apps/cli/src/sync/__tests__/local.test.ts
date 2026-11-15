import { saveState } from "../../state/store/repository.ts";
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

const fixtureClock = () => 1800000000000;

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
    await atomicWrite(join(home, "file"), "secret", fixtureClock);

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

  const adapters = createAdapters(
    {
      home: join(fixture, "home"),
      userHome: fixture,
      keychain: createMemoryKeychainAdapter([]),
    },
    fixtureClock,
  );

  adapters.repo = createFakeRepoAdapter({
    caseInsensitive: async () => false,
    checkoutAt: async () => checkout,
  });

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
    caseInsensitive: async () => false,
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
  test(`resolve ${choice} uses recorded snapshots and clears its conflict`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-resolve-"));

    const adapters = createAdapters(
      {
        home,
        userHome: home,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    const checkout = join(home, "checkout");

    adapters.repo = createFakeRepoAdapter({
      checkoutAt: async () => ({
        root: checkout,
        gitDir: join(checkout, ".git"),
        repoId: "host/repo",
      }),
      ensureIgnored: async () => {},
    });

    try {
      const store = join(home, "store", ".env");
      const file = join(home, "conflicts", "edited");
      const server = file + ".server";
      const base = join(home, "base", "one");
      await atomicWrite(store, "KEY=mine\n", fixtureClock);
      await atomicWrite(file, "KEY=edited\n", fixtureClock);
      await atomicWrite(server, "KEY=remote\n", fixtureClock);
      await atomicWrite(file + ".mine", "KEY=mine\n", fixtureClock);

      const state = emptyState("test");
      state.approved.push({ root: checkout, gitDir: join(checkout, ".git"), repoId: "host/repo" });
      state.links.push({ root: checkout, path: ".env", store, mode: "copy" });
      await saveState(home, state, fixtureClock);

      await saveConflicts(
        home,
        [
          {
            entry: null,
            remote: server,
            alternatives: [],
            targets: [{ root: checkout, path: ".env", store, mode: "copy" }],
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
        ],
        fixtureClock,
      );

      await atomicWrite(join(checkout, ".env"), "unrelated checkout bytes", fixtureClock);

      if (choice === "take-server") {
        await Promise.resolve(
          expect(resolveConflict(adapters, { choice, now: fixtureClock })).rejects.toThrow(
            "No server entry",
          ),
        );

        expect(await readBytes(store)).toEqual(bytes("KEY=mine\n"));

        return;
      }

      const result = await resolveConflict(adapters, { choice, now: () => 10 });
      expect(result.backups).toBe(join(home, "conflicts", "backups"));
      const backups = await readdir(join(home, "conflicts", "backups"));

      expect(
        await Promise.all(
          backups.map(async (name) =>
            new TextDecoder().decode(await readBytes(join(home, "conflicts", "backups", name))),
          ),
        ),
      ).toContain("unrelated checkout bytes");

      expect(new TextDecoder().decode(await readBytes(store))).toBe(
        choice === "keep-mine" ? "KEY=mine\n" : "KEY=edited\n",
      );

      expect(await readBytes(base)).toBeUndefined();
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

    await atomicWrite(
      join(directory, "0000000000001_12345678-abcd-4000-8000-000000000000"),
      "old",
      fixtureClock,
    );

    await atomicWrite(
      join(directory, "0002592000001_12345678-abcd-4000-8000-000000000000"),
      "new",
      fixtureClock,
    );

    await atomicWrite(join(directory, "unrecognized"), "keep", fixtureClock);
    await pruneBackups(home, 2592000001);

    expect(
      await readBytes(join(directory, "0000000000001_12345678-abcd-4000-8000-000000000000")),
    ).toBeUndefined();

    expect(
      await readBytes(join(directory, "0002592000001_12345678-abcd-4000-8000-000000000000")),
    ).toBeDefined();

    expect(await readBytes(join(directory, "unrecognized"))).toBeDefined();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("all skips recreated checkouts with a track notice", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-recreated-"));

  try {
    const checkout = {
      root: home,
      gitDir: join(home, ".git"),
      repoId: "host/repo",
      identity: "old",
    };

    const state = emptyState("test");
    state.approved.push(checkout);

    const adapters = createAdapters(
      {
        home: join(home, "state"),
        userHome: home,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    adapters.repo = createFakeRepoAdapter({
      checkoutAt: async () => ({ ...checkout, identity: "new" }),
    });

    const reports: string[] = [];

    expect(
      await selectedRepos(adapters, state, {
        now: () => 1,
        fetcher: fetch,
        all: true,
        report: (line) => reports.push(line),
      }),
    ).toEqual(new Set());

    expect(reports.join(" ")).toContain("envden track");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
