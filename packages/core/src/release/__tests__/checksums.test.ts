import { expect, test } from "bun:test";
import { parseSha256Sums } from "../checksums.ts";

const a = "a".repeat(64);
const b = "B".repeat(64);

test("reads text and binary entries with either line ending", () => {
  expect(parseSha256Sums(`${a}  envden-linux-x64\r\n${b} *envden-windows-x64.exe\n`)).toEqual(
    new Map([
      ["envden-linux-x64", a],
      ["envden-windows-x64.exe", "b".repeat(64)],
    ]),
  );
});

for (const [name, contents, message] of [
  ["empty", "", "Invalid SHA256SUMS entry"],
  ["short hash", `${a.slice(1)}  envden`, "Invalid SHA256SUMS entry"],
  ["non-hex hash", `${"g".repeat(64)}  envden`, "Invalid SHA256SUMS entry"],
  ["single space", `${a} envden`, "Invalid SHA256SUMS entry"],
  ["spaced name", `${a}  envden x`, "Invalid SHA256SUMS entry"],
  ["duplicate", `${a}  envden\n${a}  envden`, "Duplicate SHA256SUMS entry"],
] as const)
  test(`rejects ${name}`, () => {
    expect(() => parseSha256Sums(contents)).toThrow(message);
  });
