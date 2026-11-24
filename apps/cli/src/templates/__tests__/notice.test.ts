import { expect, test } from "bun:test";
import { templateNoticeLines } from "../notice.ts";

test("template notice names missing keys only and truncates long lists", () => {
  const check = { root: "/code/api", path: ".env", template: ".env.example", extra: ["X"] };

  expect(
    templateNoticeLines([
      { ...check, missing: ["STRIPE_KEY", "DB_URL"] },
      { ...check, path: "web/.env", missing: ["A", "B", "C", "D", "E"] },
      { ...check, missing: [] },
    ]),
  ).toEqual([
    "envden: api/.env missing STRIPE_KEY, DB_URL (from .env.example)",
    "envden: api/web/.env missing A, B, C and 2 more (from .env.example)",
  ]);
});
