import { test, expect } from "bun:test";
import { checkoutApproval } from "../approval.ts";
import { emptyState } from "../../state/model.ts";
import { storePath } from "../../store/path.ts";

test("approval binds git directory and remote, including worktrees", () => {
  const state = emptyState("laptop");
  const checkout = { root: "/code/main", gitDir: "/code/main/.git", repoId: "example/repo" };
  expect(checkoutApproval(state, checkout)).toBe("ask");
  state.approved.push(checkout);
  expect(checkoutApproval(state, checkout)).toBe("approved");
  expect(checkoutApproval(state, { ...checkout, root: "/code/branch" })).toBe("approved");
  expect(checkoutApproval(state, { ...checkout, repoId: "host/other" })).toBe("changed");
  state.aliases["host/other"] = checkout.repoId;
  expect(checkoutApproval(state, { ...checkout, repoId: "host/other" })).toBe("approved");
});

test("store paths isolate repositories and reject traversal", () => {
  expect(storePath("/tmp/envden", "a", "apps/web/.env")).not.toBe(
    storePath("/tmp/envden", "b", "apps/web/.env"),
  );

  for (const path of ["../.env", "/.env", "a/../../.env", "a\\.env"])
    expect(() => storePath("/tmp/envden", "a", path)).toThrow();
});
