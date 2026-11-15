import { spawnTrusted } from "@envden/core/process";
import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAdapters } from "../../adapters.ts";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { emptyState } from "../../state/model.ts";
import { linkCheckout } from "../place.ts";
import { pruneMissingCheckouts } from "../prune.ts";
import { discoverRepos } from "../discovery/repos.ts";
import type { IRepoSkip } from "../discovery/identify.ts";
import { setConfig } from "../../settings/config.ts";

const fixtureClock = () => 1800000000000;

test("real git worktree asks only with auto-approval off and records its root once", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-worktree-"));
  const main = join(root, "main");
  const branch = join(root, "branch");

  const git = async (cwd: string, args: string[]) => {
    const process = spawnTrusted(["git", "-C", cwd, ...args], { stdout: "ignore", stderr: "pipe" });
    if (await process.exited) throw new Error(await new Response(process.stderr).text());
  };

  try {
    await mkdir(main);
    await git(main, ["init"]);
    await git(main, ["remote", "add", "origin", "https://example.com/team/repo.git"]);

    await git(main, [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "initial",
    ]);

    await git(main, ["worktree", "add", "-b", "test", branch]);
    await writeFile(join(main, ".env"), "PORT=1");
    await writeFile(join(branch, ".env"), "PORT=1");

    const adapters = createAdapters(
      {
        home: join(root, "state"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    const state = emptyState("test");
    const checkout = (await adapters.repo.checkoutAt(main))!;
    const worktree = (await adapters.repo.checkoutAt(branch))!;
    expect(worktree.registeredWorktree).toBe(true);
    await linkCheckout(adapters, state, checkout, async () => true);
    await setConfig("auto-approve-worktrees", "off", adapters.home, () => 0, false);

    let approvals = 0;

    await linkCheckout(adapters, state, worktree, async () => {
      approvals++;

      return false;
    });

    expect(state.approved).toEqual([checkout]);

    await linkCheckout(adapters, state, worktree, async () => {
      approvals++;

      return true;
    });

    expect(approvals).toBe(2);

    for (let pass = 0; pass < 2; pass++)
      await linkCheckout(adapters, state, worktree, async () => {
        throw new Error("Repeated approval");
      });

    expect(state.approved.map((item) => item.root)).toEqual([checkout.root, worktree.root]);
    await rm(branch, { recursive: true, force: true });
    const notices: string[] = [];

    await pruneMissingCheckouts(
      adapters.home,
      state,
      (message) => notices.push(message),
      fixtureClock,
    );

    expect(state.approved.map((item) => item.root)).toEqual([checkout.root]);
    expect(state.links.every((item) => item.root !== worktree.root)).toBe(true);
    expect(notices).toHaveLength(1);

    await setConfig("auto-approve-worktrees", "on", adapters.home, () => 0, true);
    await git(main, ["worktree", "prune"]);
    await git(main, ["worktree", "add", branch, "test"]);
    const reports: string[] = [];

    await linkCheckout(
      adapters,
      state,
      (await adapters.repo.checkoutAt(branch))!,
      async () => {
        throw new Error("Prompted for an auto-approved worktree");
      },
      false,
      (message) => reports.push(message),
    );

    expect(reports).toEqual([`Approved worktree ${worktree.root} (auto-approve-worktrees)`]);
    expect(state.approved.map((item) => item.root)).toEqual([checkout.root, worktree.root]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scan skips missing, ambiguous, local and file remotes and continues", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-scan-"));

  const git = async (cwd: string, args: string[]) => {
    const child = spawnTrusted(["git", "-C", cwd, ...args], { stdout: "ignore", stderr: "ignore" });
    if (await child.exited) throw new Error("Git fixture failed");
  };

  try {
    for (const name of ["missing", "ambiguous", "local", "file", "good"]) {
      const path = join(root, name);
      await mkdir(path);
      await git(path, ["init"]);
      if (name === "missing") continue;

      if (name === "ambiguous") {
        await git(path, ["remote", "add", "first", "https://example.com/first"]);
        await git(path, ["remote", "add", "second", "https://example.com/second"]);
      } else
        await git(path, [
          "remote",
          "add",
          "origin",
          name === "local"
            ? root
            : name === "file"
              ? new URL("file:///local/repo").toString()
              : "https://example.com/good",
        ]);
    }

    const adapters = createAdapters(
      {
        home: join(root, "state"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    const skipped: IRepoSkip[] = [];

    const found = await discoverRepos(
      adapters.repo,
      { roots: [root] },
      {
        report: (skip) => skipped.push(skip),
      },
    );

    expect(found.map((item) => item.repoId)).toEqual(["example.com/good"]);
    expect(skipped.map((skip) => skip.kind)).toEqual(["remote", "remote", "remote", "remote"]);
    expect(skipped.some((skip) => skip.reason === "Unsupported git remote")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
