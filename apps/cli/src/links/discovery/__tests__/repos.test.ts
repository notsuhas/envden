import { test, expect } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { ICheckout, IRepoAdapter } from "@envden/core/adapters";
import { discoverRepos } from "../repos.ts";

interface IFakeRepo {
  worktrees?: Record<string, string[]>;
  submodules?: Record<string, string[]>;
  unidentified?: string[];
  failing?: string[];
}

function fakeRepo(asked: string[], fake: IFakeRepo = {}): IRepoAdapter {
  const fail = async (checkout: ICheckout, values?: Record<string, string[]>) => {
    if (fake.failing?.includes(checkout.root)) throw new Error("git failed");

    return values?.[checkout.root] ?? [];
  };

  return {
    checkoutAt: async (path: string): Promise<ICheckout | undefined> => {
      asked.push(path);
      if (fake.unidentified?.includes(path)) return undefined;

      return { root: path, gitDir: join(path, ".git"), repoId: path };
    },
    worktrees: (checkout: ICheckout) => fail(checkout, fake.worktrees),
    submodules: (checkout: ICheckout) => fail(checkout, fake.submodules),
  } as unknown as IRepoAdapter;
}

async function scanned(paths: string[], fake: (home: string) => IFakeRepo = () => ({})) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "envden-discovery-scan-")));

  try {
    for (const path of paths) {
      const [from, to] = path.split(" -> ") as [string, string?];

      if (to) await symlink(join(home, to), join(home, from));
      else if (/\.(json|toml)$/.test(from)) {
        await mkdir(join(home, from, ".."), { recursive: true });
        await writeFile(join(home, from), "{}");
      } else await mkdir(join(home, from, ".git"), { recursive: true });
    }

    const found = await discoverRepos(fakeRepo([], fake(home)), { roots: [home], home });

    return found.map((checkout) => relative(home, checkout.root)).sort();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

// ~/Work links to another volume, a folder links to its own parent, and one checkout has two names
test("discovery follows linked folders once per real path and judges a link by its own name", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "envden-discovery-")));

  try {
    const home = join(root, "home");
    const volume = join(root, "volume", "Work");

    for (const path of [
      join(volume, "app", ".git"),
      join(home, "projects", "api", ".git"),
      join(home, "node_modules", "dep", ".git"),
      join(home, "excluded", "secret", ".git"),
    ])
      await mkdir(path, { recursive: true });

    await symlink(volume, join(home, "Work"));
    await symlink(join(home, "projects"), join(home, "projects", "loop"));
    await symlink(join(home, "projects", "api"), join(home, "api-alias"));
    await symlink(join(home, "node_modules"), join(home, "deps"));
    await symlink(join(home, "excluded"), join(home, "excluded-alias"));

    const asked: string[] = [];

    const found = await discoverRepos(fakeRepo(asked), {
      roots: [home, join(home, "Work")],
      excluded: [join(home, "excluded-alias")],
    });

    expect(found.map((checkout) => checkout.root).sort()).toEqual([
      join(home, "node_modules", "dep"),
      join(home, "projects", "api"),
      join(volume, "app"),
    ]);

    expect(asked.sort()).toEqual([
      join(home, "node_modules", "dep"),
      join(home, "projects", "api"),
      join(volume, "app"),
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovery scans a root reached through a link", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "envden-discovery-root-")));

  try {
    await mkdir(join(root, "volume", "app", ".git"), { recursive: true });
    await symlink(join(root, "volume"), join(root, "Work"));

    const found = await discoverRepos(fakeRepo([]), { roots: [join(root, "Work")] });

    expect(found.map((checkout) => checkout.root)).toEqual([join(root, "volume", "app")]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// the maintainer's home: agent state in hidden folders, CocoaPods clones, a vendored clone in a repo
test("discovery never walks hidden, vendored or checkout folders but finds worktrees and submodules", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "envden-discovery-hidden-")));

  try {
    const app = join(home, "Work", "app");
    const worktree = join(home, ".t3", "worktrees", "app", "feature");

    for (const path of [
      join(app, ".git"),
      join(app, "libs", "clone", ".git"),
      join(app, "mods", "sub", ".git"),
      join(app, "ios", "Pods", "dav1d", ".git"),
      join(worktree, ".git"),
      join(home, ".codex", "memories", "notes", ".git"),
      join(home, "Work", "deep", "nest", ".cache", "tool", "repo", ".git"),
      join(home, "Work", "ios", "Pods", "dav1d", ".git"),
      join(home, "Work", "py", "venv", "lib", ".git"),
    ])
      await mkdir(path, { recursive: true });

    const asked: string[] = [];
    const progress: number[] = [];

    const repo = fakeRepo(asked, {
      worktrees: { [app]: [app, worktree] },
      submodules: { [app]: ["mods/sub", "../outside"] },
    });

    const found = await discoverRepos(
      repo,
      { roots: [home], home },
      {
        progress: (count) => progress.push(count),
      },
    );

    expect(found.map((checkout) => checkout.root).sort()).toEqual(
      [app, join(app, "mods", "sub"), worktree].sort(),
    );

    expect(asked.sort()).toEqual([app, join(app, "mods", "sub"), worktree].sort());
    expect(progress).toEqual([1, 2, 3]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a hidden scan root is walked", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "envden-discovery-dot-")));

  try {
    await mkdir(join(root, ".config", "tools", "app", ".git"), { recursive: true });

    const found = await discoverRepos(fakeRepo([]), { roots: [join(root, ".config")] });

    expect(found.map((checkout) => checkout.root)).toEqual([join(root, ".config", "tools", "app")]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// a stray git init in ~/code once hid every repo inside it
test("a folder git can't identify is still walked", async () => {
  expect(
    await scanned(["code", "code/api", "code/web"], (home) => ({
      unidentified: [join(home, "code")],
    })),
  ).toEqual(["code/api", "code/web"]);
});

test("a visibly named link is walked even when its folder's own name would be skipped", async () => {
  expect(await scanned([".projects/api", "code -> .projects"])).toEqual([".projects/api"]);
});

test("one repo whose worktrees or submodules fail never stops the scan", async () => {
  expect(
    await scanned(["a", "b"], (home) => ({
      failing: [join(home, "a")],
      worktrees: { [join(home, "b")]: [join(home, "b")] },
    })),
  ).toEqual(["a", "b"]);
});

test("home-level tool folders and build output are skipped only where they are tool folders", async () => {
  expect(
    await scanned([
      "go/pkg/mod/github.com/x",
      "AppData/Local/x",
      "snap/app/x",
      "miniconda3/pkgs/x",
      "Work/go/app",
      "Work/AppData",
      "target/svc",
      "dist/site",
      "Work/proj/package.json",
      "Work/proj/target/dep",
      "Work/proj/build/dep",
      "Work/rust/Cargo.toml",
      "Work/rust/target/dep",
      "Work/app/node_modules/dep",
    ]),
  ).toEqual(["Work/AppData", "Work/go/app", "dist/site", "target/svc"]);
});
