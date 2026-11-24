import { expect, test } from "bun:test";
import { emptyState } from "../../../state/model.ts";
import { pulledFiles } from "../auto-pull.ts";
import { changedFileLine, pulledFileLine } from "../lines.ts";

const file = { repoId: "github.com/acme/api", path: ".env", label: "api/.env", keys: [] };

for (const [changes, changed, pulled] of [
  [
    { device: "throwbook", keys: ["STRIPE_KEY", "DB_URL"], count: 2 },
    "envden: api/.env 2 keys changed on throwbook (STRIPE_KEY, DB_URL); run envden pull",
    "envden: pulled api/.env (2 keys)",
  ],
  [
    { device: "throwbook", keys: ["A", "B", "C"], count: 5 },
    "envden: api/.env 5 keys changed on throwbook (A, B, C and 2 more); run envden pull",
    "envden: pulled api/.env (5 keys)",
  ],
  [
    { keys: ["TOKEN"], count: 1 },
    "envden: api/.env 1 key changed (TOKEN); run envden pull",
    "envden: pulled api/.env (1 key)",
  ],
  [
    { device: "throwbook", count: 0 },
    "envden: api/.env changed on throwbook; run envden pull",
    "envden: pulled api/.env",
  ],
  [{}, "envden: api/.env changed; run envden pull", "envden: pulled api/.env"],
] as const)
  test(`notice lines ${JSON.stringify(changes)}`, () => {
    expect(changedFileLine({ ...file, ...changes, keys: [...(changes.keys ?? [])] })).toBe(changed);
    expect(pulledFileLine({ ...file, ...changes, keys: [...(changes.keys ?? [])] })).toBe(pulled);
  });

test("a pulled file the notice hadn't seen yet still gets a line", () => {
  const state = emptyState("test");

  state.approved.push({
    root: "/code/web",
    gitDir: "/code/web/.git",
    repoId: "github.com/acme/web",
  });

  const waiting = [{ ...file, keys: ["TOKEN"], count: 1 }];

  expect(
    pulledFiles(state, waiting, [
      { repoId: file.repoId, path: ".env" },
      { repoId: "github.com/acme/web", path: ".env.local" },
    ]).map(pulledFileLine),
  ).toEqual(["envden: pulled api/.env (1 key)", "envden: pulled web/.env.local"]);
});
