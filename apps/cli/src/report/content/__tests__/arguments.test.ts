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
    ["vault", "--recovery-kit", "/k", "--kit-out", "/o"],
    ["vault", "--recovery-kit", "[redacted]", "--kit-out", "/o"],
  ],
  [
    ["unlock", "--password", "p", "x"],
    ["unlock", "--password", "[redacted]", "[redacted]"],
  ],
  [
    ["--master-passphrase=p", "y"],
    ["--master-passphrase=[redacted]", "[redacted]"],
  ],
])("%p", (input, expected) => {
  expect(maskArguments(input)).toEqual(expected);
});
