import { expect, test } from "bun:test";
import { lstat, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { setConfig } from "../../settings/config.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { pull, push } from "../engine.ts";
import { syncFixture } from "./flows.ts";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { linkCheckout } from "../../links/place.ts";

const fixtureClock = () => 1800000000000;

test("sync honors copy preference and prunes adapter backups after placement", async () => {
  const fixture = await syncFixture();
  const { second, checkoutB, opts } = fixture;

  const expired = join(
    second.home,
    "conflicts",
    ".envden-backup-0-00000000-0000-0000-0000-000000000000",
  );

  try {
    await setConfig(
      "placement",
      JSON.stringify({ [checkoutB.root]: "copy" }),
      second.home,
      () => 0,
    );

    await atomicWrite(expired, "old backup", fixtureClock);
    const prune = second.prunePlacementBackups;
    const calls: number[] = [];

    second.prunePlacementBackups = async (now) => {
      calls.push(now);
      await prune(now);
    };

    await pull(second, opts);
    expect(calls).toEqual([opts.now()]);
    expect((await loadState(second.home))!.links[0]!.mode).toBe("copy");
    expect((await lstat(join(checkoutB.root, ".env"))).isSymbolicLink()).toBe(false);
    expect(await Bun.file(expired).exists()).toBe(false);
  } finally {
    await fixture.cleanup();
  }
});

test("pull places env files in a worktree of an approved clone unless the setting is off", async () => {
  const fixture = await syncFixture();
  const { second, checkoutB, opts, root } = fixture;
  const worktree = { ...checkoutB, root: join(root, "worktree"), registeredWorktree: true };
  const reports: string[] = [];

  const options = {
    ...opts,
    all: false,
    cwd: worktree.root,
    report: (m: string) => reports.push(m),
  };

  try {
    await mkdir(worktree.root);

    second.repo = createFakeRepoAdapter({
      caseInsensitive: async () => false,
      checkoutAt: async (path) => (path === worktree.root ? worktree : checkoutB),
      ensureIgnored: async () => {},
    });

    await setConfig("auto-approve-worktrees", "off", second.home, () => 0, false);
    await Promise.resolve(expect(pull(second, options)).rejects.toThrow("approved checkout"));
    expect(await Bun.file(join(worktree.root, ".env")).exists()).toBe(false);

    await setConfig("auto-approve-worktrees", "on", second.home, () => 0, true);
    await pull(second, options);
    expect(reports).toContainEqual(expect.stringContaining(worktree.root));
    expect(await Bun.file(join(worktree.root, ".env")).text()).toBe("TOKEN=local-test-value\n");

    expect((await loadState(second.home))!.approved.map((item) => item.root)).toContain(
      worktree.root,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("directory collision preserves both originals and reports the logical loser", async () => {
  const fixture = await syncFixture();
  const { first, second, checkout, checkoutB, opts, now } = fixture;

  try {
    await atomicWrite(join(checkout.root, "Dir/.env"), "FIRST=one\n", now);
    await atomicWrite(join(checkout.root, "dir/.env.local"), "SECOND=two\n", now);

    first.repo = createFakeRepoAdapter({
      caseInsensitive: async () => false,
      checkoutAt: async () => checkout,
      envFiles: async () => ["Dir/.env", "dir/.env.local"],
      ensureIgnored: async () => {},
    });

    const state = (await loadState(first.home))!;
    await linkCheckout(first, state, checkout, async () => true);
    await saveState(first.home, state, now);
    await push(first, opts);

    first.repo = createFakeRepoAdapter({
      caseInsensitive: async () => true,
      checkoutAt: async () => checkout,
      ensureIgnored: async () => {},
    });

    const originalReports: string[] = [];

    const originalPull = await pull(first, {
      ...opts,
      report: (message) => originalReports.push(message),
    });

    expect(originalPull.changed).toBe(0);
    expect(originalPull.conflicts).toBe(1);
    expect(originalReports).toEqual(["Could not place env file: dir/.env.local"]);

    second.repo = createFakeRepoAdapter({
      caseInsensitive: async () => true,
      checkoutAt: async () => checkoutB,
      ensureIgnored: async () => {},
    });

    const reports: string[] = [];
    const result = await pull(second, { ...opts, report: (message) => reports.push(message) });
    expect(result.conflicts).toBe(1);
    expect(reports).toEqual(["Could not place env file: dir/.env.local"]);
    expect(await Bun.file(join(checkoutB.root, "Dir/.env")).text()).toBe("FIRST=one\n");
    expect(await Bun.file(join(checkoutB.root, "dir/.env.local")).exists()).toBe(false);

    for (const [path, content] of [
      ["Dir/.env", "FIRST=one\n"],
      ["dir/.env.local", "SECOND=two\n"],
    ] as const) {
      expect(await Bun.file(join(checkout.root, path)).text()).toBe(content);
      expect((await stat(join(checkout.root, path))).mode & 0o777).toBe(0o600);
    }
  } finally {
    await fixture.cleanup();
  }
});
