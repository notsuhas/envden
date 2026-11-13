import { test, expect } from "bun:test";
import { parseKit } from "../input.ts";

for (const value of [
  null,
  false,
  "kit",
  {},
  { vaultId: "v" },
  { vaultId: 1, secretKey: "s" },
  { vaultId: "v", secretKey: 1 },
])
  test(`rejects invalid kit ${JSON.stringify(value)}`, () => {
    expect(() => parseKit(value)).toThrow("Invalid recovery kit");
  });

test("reads kit fields and allows metadata", () => {
  expect(parseKit({ vaultId: "v", secretKey: "s", server: "local" })).toEqual({
    vaultId: "v",
    secretKey: "s",
  });
});
