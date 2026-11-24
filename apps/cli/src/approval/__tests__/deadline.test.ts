import { expect, test } from "bun:test";
import { requestDeadline } from "../exchange.ts";

test("a server clock ahead of ours only shortens the join window, never refuses it", () => {
  expect(requestDeadline(600000 + 1000, 0)).toBe(600000);
  expect(requestDeadline(300000, 0)).toBe(300000);
  expect(() => requestDeadline(1000, 1000)).toThrow("expired");
});
