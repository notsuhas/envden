import { expect, test } from "bun:test";
import { parseSha256Sums } from "../checksums.ts";

const a = "a".repeat(64);
const b = "B".repeat(64);

test("reads text and binary entries with either line ending", () => {
  expect(parseSha256Sums(`${a}  envden-linux-x64\r\n${b} *envden-linux-arm64\n`)).toEqual(
    new Map([
      ["envden-linux-x64", a],
      ["envden-linux-arm64", "b".repeat(64)],
    ]),
  );
});

for (const [name, contents, message] of [
  ["empty", "", /Invalid/],
  ["short hash", `${a.slice(1)}  envden`, /Invalid/],
  ["non-hex hash", `${"g".repeat(64)}  envden`, /Invalid/],
  ["single space", `${a} envden`, /Invalid/],
  ["spaced name", `${a}  envden x`, /Invalid/],
  ["duplicate", `${a}  envden\n${a}  envden`, /Duplicate/],
] as const)
  test(`rejects ${name}`, () => {
    expect(() => parseSha256Sums(contents)).toThrow(message);
  });
