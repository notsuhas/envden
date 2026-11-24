import { expect, test } from "bun:test";
import { confirmedPassphrase, keyChoice } from "../key.ts";

test("exactly one of recipients or a passphrase", () => {
  expect(keyChoice(["age1a", "age1b"], false)).toEqual({
    kind: "recipients",
    recipients: ["age1a", "age1b"],
  });

  expect(keyChoice([], true)).toEqual({ kind: "passphrase" });
  expect(() => keyChoice([], false)).toThrow("Use either --recipient or --passphrase");
  expect(() => keyChoice(["age1a"], true)).toThrow("Use either --recipient or --passphrase");
});

test("the passphrase must be typed the same twice", async () => {
  const answers =
    (...values: string[]) =>
    async () =>
      values.shift()!;

  expect(await confirmedPassphrase(answers("long phrase", "long phrase"))).toBe("long phrase");

  await Promise.resolve(
    expect(confirmedPassphrase(answers("long phrase", "long phrase."))).rejects.toThrow(
      "The passphrases don't match",
    ),
  );
});
