import { expect, test } from "bun:test";
import { emptyState } from "../../state/model.ts";
import { offerForkAlias, shouldAskAlias } from "../fork.ts";

for (const [upstream, exists, aliases, expected] of [
  [undefined, true, {}, false],
  ["upstream", false, {}, false],
  ["upstream", true, {}, true],
  ["fork", true, {}, false],
  ["upstream", true, { upstream: "other" }, false],
  ["upstream", true, { other: "fork" }, false],
  ["constructor", true, {}, true],
] satisfies [string | undefined, boolean, Record<string, string>, boolean][])
  test(`fork alias decision ${upstream} ${exists} ${JSON.stringify(aliases)}`, () => {
    const state = emptyState("test");
    Object.assign(state.aliases, aliases);

    const checkout = {
      root: "/repo",
      gitDir: "/repo/.git",
      repoId: "fork",
      ...(upstream ? { upstreamRepoId: upstream } : {}),
    };

    expect(shouldAskAlias(state, checkout, new Set(exists ? [upstream ?? ""] : []))).toBe(expected);
  });

for (const accepted of [true, false])
  test(`fork alias asks once after ${accepted}`, async () => {
    const state = emptyState("test");

    const checkout = {
      root: "/repo",
      gitDir: "/repo/.git",
      repoId: "fork",
      upstreamRepoId: "upstream",
    };

    let asks = 0;

    const confirm = async () => {
      asks++;

      return accepted;
    };

    await offerForkAlias(state, checkout, new Set(["upstream"]), confirm);
    await offerForkAlias(state, checkout, new Set(["upstream"]), confirm);
    expect(asks).toBe(1);
    expect(state.aliases.fork).toBe(accepted ? "upstream" : undefined);
  });

test("fork with placed files in another checkout is never offered an alias", () => {
  const state = emptyState("test");
  state.approved.push({ root: "/other", gitDir: "/other/.git", repoId: "fork" });
  state.links.push({ root: "/other", path: ".env", store: "/store", mode: "copy" });

  expect(
    shouldAskAlias(
      state,
      {
        root: "/repo",
        gitDir: "/repo/.git",
        repoId: "fork",
        upstreamRepoId: "upstream",
      },
      new Set(["upstream"]),
    ),
  ).toBe(false);
});
