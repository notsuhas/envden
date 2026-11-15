import { test, expect } from "bun:test";
import { Readable } from "node:stream";
import { encodeToken } from "@envden/core/protocol";
import { readToken } from "../token.ts";

const setup = encodeToken("setup", new Uint8Array(20).fill(7), new Uint8Array(32).fill(9));
const invalid = { code: "INVALID_INPUT" };

test("token entry accepts stdin and the flag, and rejects anything else up front", async () => {
  expect(await readToken("setup", undefined, Readable.from([`${setup}\n`]))).toBe(setup);
  expect(await readToken("setup", setup, Readable.from([]))).toBe(setup);

  for (const [kind, value] of [
    ["setup", undefined],
    ["setup", setup.slice(4)],
    ["repair", setup],
  ] as const)
    await Promise.resolve(
      expect(readToken(kind, value, Readable.from([]))).rejects.toMatchObject(invalid),
    );
});
