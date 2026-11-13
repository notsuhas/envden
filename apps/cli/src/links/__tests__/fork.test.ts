import { expect, test } from "bun:test";
import { emptyState } from "../../state/model.ts";
import { offerForkAlias, shouldAskAlias } from "../fork.ts";

for (const [upstream, exists, expected] of [
  [undefined, true, false],
  ["upstream", false, false],
  ["upstream", true, true],
] as const)
  test(`fork alias decision ${upstream} ${exists}`, () => {
    const checkout = {
      root: "/repo",
      gitDir: "/repo/.git",
      repoId: "fork",
      ...(upstream ? { upstreamRepoId: upstream } : {}),
    };

    expect(shouldAskAlias(emptyState("test"), checkout, new Set(exists ? ["upstream"] : []))).toBe(
      expected,
    );
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
