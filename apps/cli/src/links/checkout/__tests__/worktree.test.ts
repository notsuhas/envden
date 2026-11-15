import { test, expect } from "bun:test";
import { worktreeApproval } from "../worktree.ts";
import { emptyState } from "../../../state/model.ts";
import { parseConfig } from "../../../settings/config.ts";

test("worktrees of an approved clone are approved unless the setting is off", () => {
  const clone = {
    root: "/code/main",
    gitDir: "/code/main/.git",
    repoId: "host/repo",
    identity: "a",
  };

  const worktree = { ...clone, root: "/code/branch", identity: "b", registeredWorktree: true };
  const separate = { ...clone, root: "/code/other", gitDir: "/code/other/.git", identity: "c" };
  const approved = emptyState("test");
  approved.approved.push(clone);
  const recreated = emptyState("test");
  recreated.approved.push(clone, { ...worktree, identity: "old" });
  const enabled = parseConfig({})["auto-approve-worktrees"];

  const rows = [
    ["default", approved, worktree, clone, enabled, "approved"],
    ["setting off", approved, worktree, clone, false, "ask"],
    ["clone unapproved", emptyState("test"), worktree, clone, true, "ask"],
    ["clone recreated", approved, worktree, { ...clone, identity: "new" }, true, "ask"],
    ["no clone", approved, worktree, undefined, true, "ask"],
    ["separate clone", approved, separate, clone, true, "ask"],
    [
      "unregistered worktree",
      approved,
      { ...worktree, registeredWorktree: false },
      clone,
      true,
      "ask",
    ],
    ["main clone itself", emptyState("test"), clone, clone, true, "ask"],
    ["other repository", approved, { ...worktree, repoId: "host/fork" }, clone, true, "ask"],
    ["recreated path", recreated, worktree, clone, true, "ask"],
  ] as const;

  for (const [name, state, checkout, main, on, expected] of rows)
    expect([name, worktreeApproval(state, checkout, main, on)]).toEqual([name, expected]);
});
