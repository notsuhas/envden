import { expect, test } from "bun:test";
import { maskArguments } from "../arguments.ts";

test.each([
  [
    ["push", "--yes"],
    ["push", "--yes"],
  ],
  [
    ["join", "h", "--setup-token", "T"],
    ["join", "h", "--setup-token", "[redacted]"],
  ],
  [
    ["--repair-token=T", "--json"],
    ["--repair-token=[redacted]", "--json"],
  ],
  [
    ["vault", "recovery-code", "--recovery-code-out", "/o"],
    ["vault", "recovery-code", "--recovery-code-out", "/o"],
  ],
  [
    ["unlock", "--password", "p", "x"],
    ["unlock", "--password", "[redacted]", "[redacted]"],
  ],
  [
    ["--master-passphrase=p", "y"],
    ["--master-passphrase=[redacted]", "[redacted]"],
  ],
  [
    ["receive", "https://n.t.ts.net:10000/s/abc#KEY", ".env"],
    ["receive", "https://n.t.ts.net:10000/s/abc#[redacted]", ".env"],
  ],
])("%p", (input, expected) => {
  expect(maskArguments(input)).toEqual(expected);
});
