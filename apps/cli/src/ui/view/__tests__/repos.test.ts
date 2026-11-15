import { expect, test } from "bun:test";
import { groupRepos } from "../repos.ts";

test("files group by repo, then checkout", () => {
  const file = (path: string, status: "in-sync" | "conflict" = "in-sync") =>
    ({ path, mode: "link", status }) as const;

  const repos = groupRepos([
    { repoId: "b/repo", root: "/b", approval: "approved", file: file(".env") },
    { repoId: "a/repo", root: "/a", approval: "approved", file: file(".env") },
    { repoId: "a/repo", root: "/a", approval: "approved", file: file(".env.test", "conflict") },
    { repoId: "a/repo", root: "/a-wt", approval: "needs-approval", file: file(".env") },
  ]);

  expect(repos.map((repo) => [repo.repoId, repo.status])).toEqual([
    ["a/repo", "conflict"],
    ["b/repo", "in-sync"],
  ]);

  expect(repos[0]!.checkouts).toEqual([
    { root: "/a", approval: "approved", files: [file(".env"), file(".env.test", "conflict")] },
    { root: "/a-wt", approval: "needs-approval", files: [file(".env")] },
  ]);
});
