import { expect, test } from "bun:test";
import { newToken, tokenMatches } from "../token.ts";

const token = newToken();

test("tokens carry 32 random bytes", () => {
  expect(Buffer.from(token, "base64url")).toHaveLength(32);
  expect(newToken()).not.toBe(token);
});

test.each([
  [`Bearer ${token}`, true],
  [`Bearer ${token}x`, false],
  [`Bearer ${token.slice(1)}`, false],
  [`bearer ${token}`, false],
  [token, false],
  ["Bearer ", false],
  [undefined, false],
])("authorization %p matches %p", (header, matches) => {
  expect(tokenMatches(header, token)).toBe(matches);
});
