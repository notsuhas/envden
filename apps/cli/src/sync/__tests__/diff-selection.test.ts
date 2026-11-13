import { expect, test } from "bun:test";
import { includeLink } from "../diff.ts";
import { emptyState } from "../../state/model.ts";

for (const [approved, localOnly, alias, selected, expected] of [
  [false, false, false, true, false],
  [true, true, false, true, false],
  [true, false, false, false, false],
  [true, false, false, true, true],
  [true, false, true, true, true],
] as const)
  test(`diff selection ${approved} ${localOnly} ${alias} ${selected}`, () => {
    const state = emptyState("test");
    if (approved) state.approved.push({ root: "/repo", gitDir: "/repo/.git", repoId: "repo" });
    if (alias) state.aliases.repo = "target";

    const link = {
      root: "/repo",
      path: ".env",
      store: "/store/.env",
      mode: "link" as const,
      ...(localOnly ? { localOnly: true as const } : {}),
    };

    expect(includeLink(state, link, new Set(selected ? [alias ? "target" : "repo"] : []))).toBe(
      expected,
    );
  });
