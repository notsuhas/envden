import { expect, test } from "bun:test";
import { outputObservation } from "../compare/output.ts";
import { conversationTurn } from "../compare/conversation.ts";

const identity = (text: string) => text;
const pty = (text: string) => outputObservation(text, "pty", identity);
const result = "Joined as device-b. Synced 1 env file in ~/app.";

for (const [clack, huh] of [
  [
    "◇ Sync env files for these checkouts?\n│ ~/app.firm\n│ ↑/↓ to navigate, enter to confirm",
    "Sync env files for these checkouts?\n  ~/app\n  ↑/↓ to navigate, enter to confirm",
  ],
  ["◇ Add device-b?\n│ Yeses / ○ No", "Add device-b?\n  Yes"],
  [
    "◆ Let envden manage ~/shared.env?\n│ ● Yes / ○ No\n│ ↑/↓\n◇ Let envden manage ~/shared.env?\n│ Yes",
    "┃ Let envden manage ~/shared.env?\n┃ > Yes / No\n┃ ↑/↓\nLet envden manage ~/shared.env?\n  Yes",
  ],
] satisfies [string, string][]) {
  test(`prompt rows do not contribute stdout facts: ${clack}`, () => {
    expect(pty(`${clack}\n${result}`)).toBe(pty(`${huh}\n${result}`));
  });
}

for (const outcome of [result, "Pushed 2 files", "Saved /tmp/app/.env", `✓ ${result}`]) {
  test(`outcomes after prompts remain observable: ${outcome}`, () => {
    const prompt = "◇ Add device-b?\n│ Yes\n";
    expect(pty(prompt + outcome)).not.toBe(pty(prompt));

    expect(pty(prompt + outcome)).not.toBe(
      pty(prompt + outcome.replace(/device-b|2|app/g, "other")),
    );
  });
}

test("conversation still compares missing prompts, choices and different answers", () => {
  const prompt = "◇ Add device-b?\n│ ● Yes / ○ No";
  expect(conversationTurn(prompt, "y\r")).not.toEqual(conversationTurn(prompt, "n\r"));
  expect(conversationTurn(prompt, "y\r")).not.toEqual(conversationTurn("", "y\r"));

  expect(conversationTurn(prompt, "y\r")).not.toEqual(
    conversationTurn("◇ Add device-b?\n│ ● Yes", "y\r"),
  );

  expect(pty(`${prompt}\n${result}`)).not.toBe(pty(result));
});

test("non-PTY facts retain prompt-looking lines and answers", () => {
  for (const text of [
    "◇ Add device-b?\n│ No",
    "◇ Sync env files for these checkouts?\n│ ~/app.firm",
  ]) {
    expect(outputObservation(text, "semantic", identity)).not.toBe(
      outputObservation("", "semantic", identity),
    );
  }
});
