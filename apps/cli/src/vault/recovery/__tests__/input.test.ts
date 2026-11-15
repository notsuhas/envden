import { test, expect } from "bun:test";
import * as p from "@envden/core/protocol";
import { parseKit, secretKeyProblem, vaultIdProblem } from "../input.ts";

const vaultId = p.base32(new Uint8Array(32).fill(3));
const secretKey = p.encodeSecretKey(new Uint8Array(16).fill(5));

for (const value of [
  "# kit",
  "null",
  "{}",
  JSON.stringify({ vaultId }),
  JSON.stringify({ vaultId: 1, secretKey }),
  JSON.stringify({ vaultId: "v", secretKey }),
  JSON.stringify({ vaultId, secretKey: "EK1-AAAAA" }),
])
  test(`rejects ${value} as a kit file`, () => {
    expect(() => parseKit(value)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT", message: "Not a recovery kit file" }),
    );
  });

test("reads kit fields and allows metadata", () => {
  expect(parseKit(JSON.stringify({ vaultId, secretKey, server: "local" }))).toEqual({
    vaultId,
    secretKey,
  });
});

test("typed kit fields are checked before the password", () => {
  expect(secretKeyProblem(` ${secretKey.toLowerCase()} `)).toBeUndefined();
  expect(vaultIdProblem(vaultId)).toBeUndefined();

  for (const typo of ["", "EK1-", secretKey.slice(0, -1) + "0", secretKey.slice(4), vaultId])
    expect(secretKeyProblem(typo)).toContain("Not a secret key");

  for (const typo of ["", vaultId.slice(1), `${vaultId}!`, secretKey])
    expect(vaultIdProblem(typo)).toContain("Not a vault ID");
});
