import { expect, test } from "bun:test";
import { join } from "node:path";
import { emptyState } from "../../../state/model.ts";
import { historyTargets, selectionDirectory } from "../select.ts";

const root = join("/work", "app");
const worktree = join("/work", "app-feature");
const other = join("/work", "other");

const state = {
  ...emptyState("device"),
  approved: [
    { root, gitDir: join(root, ".git"), repoId: "example/app" },
    { root: worktree, gitDir: join(root, ".git"), repoId: "example/app" },
    { root: other, gitDir: join(other, ".git"), repoId: "example/fork" },
  ],
  aliases: { "example/fork": "example/app" },
  links: [
    { root, path: ".env", store: "/store/app/.env", mode: "link" as const },
    { root, path: "api/.env.local", store: "/store/app/api", mode: "copy" as const },
    { root: worktree, path: ".env", store: "/store/app/.env", mode: "link" as const },
    { root, path: ".env.test", store: "/store/x", mode: "link" as const, localOnly: true as const },
  ],
};

const repos = new Set(["example/app"]);
const paths = (targets: ReturnType<typeof historyTargets>) => targets.map((t) => [t.root, t.path]);

test("default selects the current checkout's tracked files", () => {
  expect(paths(historyTargets(state, repos, { cwd: join(root, "api") }))).toEqual([
    [root, ".env"],
    [root, "api/.env.local"],
  ]);
});

test("--all selects every approved checkout and resolves aliases", () => {
  const targets = historyTargets(state, repos, { cwd: "/", all: true });

  expect(paths(targets)).toEqual([
    [root, ".env"],
    [root, "api/.env.local"],
    [worktree, ".env"],
  ]);

  expect(new Set(targets.map((target) => target.repoId))).toEqual(repos);
});

test("a named file selects its own checkout, even untracked or local only", () => {
  expect(historyTargets(state, repos, { cwd: worktree, file: "../app/.env.test" })).toEqual([
    { root, path: ".env.test", repoId: "example/app", link: state.links[3]! },
  ]);

  expect(historyTargets(state, repos, { cwd: other, file: ".env.gone" })).toEqual([
    { root: other, path: ".env.gone", repoId: "example/app" },
  ]);

  expect(selectionDirectory({ cwd: "/", file: join(root, "api", ".env") })).toBe(join(root, "api"));
});

for (const [file, code] of [
  [join("/elsewhere", ".env"), "NOT_FOUND"],
  [root, "INVALID_INPUT"],
] as const)
  test(`a named file outside a checkout is refused: ${file}`, () => {
    expect(() => historyTargets(state, repos, { cwd: root, file })).toThrow(
      expect.objectContaining({ code }),
    );
  });
