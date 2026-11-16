import { expect, test } from "bun:test";
import { matchesPrompt } from "../compare/prompt/match.ts";
import { terminalText } from "../normalize/terminal.ts";

test("an answered password title redraw cannot satisfy the next password prompt", () => {
  const redraw = "\x1b[999D\x1b[4A\x1b[1B\x1b[J◇  Old master password\r\n│  ▪▪▪▪\r\n";
  const screen = terminalText(redraw);
  expect(matchesPrompt(screen, "Master password", "old master password")).toBe(false);
  expect(matchesPrompt(screen, "Old master password", "old master password")).toBe(false);

  expect(
    matchesPrompt(screen + "◆ Master password\n│ _", "Master password", "old master password"),
  ).toBe(true);

  expect(matchesPrompt("Confirm master password", "Master password")).toBe(false);

  expect(
    matchesPrompt("Files point to ~/shared.env. Let envden manage it?", "Let envden manage it?"),
  ).toBe(true);
});
