import { expect, test } from "bun:test";
import { pathCollisions } from "../collisions.ts";

test("later aliases and directory aliases collide", () => {
  const paths = [".env", ".ENV", "é/.env", "e\u0301/.env", "Dir/.env", "dir/.env.local"];
  expect([...pathCollisions(paths, false)]).toEqual([3]);
  expect([...pathCollisions(paths, true)]).toEqual([1, 3, 5]);
});
