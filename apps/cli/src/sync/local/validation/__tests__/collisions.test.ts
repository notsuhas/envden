import { expect, test } from "bun:test";
import { pathCollisions } from "../collisions.ts";

test("lexically later aliases and directory aliases collide", () => {
  const paths = [".env", ".ENV", "é/.env", "e\u0301/.env", "Dir/.env", "dir/.env.local"];
  expect([...pathCollisions(paths, false)]).toEqual([2]);
  expect([...pathCollisions(paths, true)]).toEqual([0, 5, 2]);
});

test("collision losers do not depend on encrypted entry order", () => {
  for (const paths of [
    ["Dir/.env", "dir/.env.local"],
    ["dir/.env.local", "Dir/.env"],
  ]) {
    expect([...pathCollisions(paths, true)].map((index) => paths[index])).toEqual([
      "dir/.env.local",
    ]);

    expect([...pathCollisions(paths, false)]).toEqual([]);
  }
});
