import { test, expect } from "bun:test";
import { Readable } from "node:stream";
import { readToken } from "../token.ts";

test("token entry accepts stdin and preserves the explicit flag", async () => {
  expect(await readToken(undefined, "Token", Readable.from(["test-token\n"]))).toBe("test-token");
  expect(await readToken("flag-token", "Token", Readable.from([]))).toBe("flag-token");

  await Promise.resolve(
    expect(readToken(undefined, "Token", Readable.from([]))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    }),
  );
});
