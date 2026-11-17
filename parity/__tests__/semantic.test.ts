import { expect, test } from "bun:test";
import { outputObservation } from "../compare/output.ts";
import { choices, conversation, conversationTurn } from "../compare/conversation.ts";
import { facts } from "../compare/facts.ts";
import { help } from "../compare/help.ts";

const identity = (text: string) => text;
const observe = (text: string) => outputObservation(text, "semantic", identity);

for (const [a, b] of [
  ["Pushed 2 files: /tmp/app/.env", "\x1b[32m│ PUSHED: 2\x1b[0m\n◇ files /tmp/app/.env\n\n"],
  ['Removed device "Laptop".', '◆ Device "Laptop" removed!'],
  ["device: laptop", "device:laptop"],
  ["file: Makefile", "file:Makefile"],
  ["held back 2 .env.local <BYTES:32#1>", "HELD\nBACK: 2 .env.local <BYTES:32#1>"],
  ["error E_LOCKED: /tmp/app.env", "E_LOCKED /tmp/app.env ERROR!"],
] satisfies [string, string][])
  test(`restyle passes: ${a}`, () => expect(observe(a)).toBe(observe(b)));

for (const [a, b] of [
  ["pushed 2 files /tmp/app/.env", "pushed 2 files"],
  ["pushed 2 files", "pushed 3 files"],
  ["changed -1", "changed 1"],
  ["pushed .env", "pushed"],
  ["removed Makefile", "removed"],
  ["not pushed", "pushed"],
  ["pushed 2 files", "pulled 2 files"],
  ['removed "Laptop"', 'removed "Desktop"'],
  ["device: laptop", "device: desktop"],
  ["error E_LOCKED", "error E_MISSING"],
  ["joined <BYTES:32#1>", "joined <BYTES:32#2>"],
  [".env.local .env.local", ".env.local"],
  ["v1.2.3", "v1.2.4"],
] satisfies [string, string][])
  test(`changed fact fails: ${a}`, () => expect(observe(a)).not.toBe(observe(b)));

test("prompt order, presence and choices are observable", () => {
  const a = "◇ Server address\n◇ Master password\n◇ Confirm master password";
  expect(conversation(a)).toEqual(["server address", "master password", "confirm master password"]);

  expect(conversation(a)).not.toEqual(
    conversation("Master password\nServer address\nConfirm master password"),
  );

  expect(conversation(a)).not.toEqual(conversation("Server address\nMaster password"));

  expect(conversation("Host the server on this machine?\nServer\naddress")).toEqual([
    "host server machine",
    "server address",
  ]);

  expect(choices("● Yes / ○ No")).not.toEqual(choices("● Yes"));
  expect(choices("● Red\n○ Blue")).toEqual(choices("[ ] Blue\n[x] Red"));
});

test("JSON compares values, types and array order strictly", () => {
  const json = (text: string) => outputObservation(text, "json", identity);
  expect(json('{ "count": 2 }')).toBe(json('{"count":2}'));
  expect(json('{"count":2}')).not.toBe(json('{"count":3}'));
  expect(json('{"count":2}')).not.toBe(json('{"count":"2"}'));
  expect(json("[1,2]")).not.toBe(json("[2,1]"));
  expect(() => json("{broken}")).toThrow();
});

test("help compares command and option sets", () => {
  const a =
    "Commands:\n  device [options] Manage devices\n  push Upload\nOptions:\n  -h, --help Show help\n  --json JSON";

  const b = "COMMANDS:\n push\n device\nOPTIONS:\n --json\n --help, -h";
  expect(help(a)).toEqual(help(b));
  expect(help(a)).not.toEqual(help(b.replace("--json", "--verbose")));
  expect(help(a)).not.toEqual(help(b.replace("\n device", "")));
});

test("fact multiplicity survives layout changes", () => {
  expect(facts("pushed /a/.env /a/.env")).not.toEqual(facts("pushed /a/.env"));
});

test("answers and unknown prompt order stay observable", async () => {
  const { conversationTurn } = await import("../compare/conversation.ts");

  expect(conversationTurn("Master password", "secret\r")).not.toEqual(
    conversationTurn("Master password", "other\r"),
  );

  expect(conversation("Ready?\nMaster password")).not.toEqual(
    conversation("Master password\nReady?"),
  );

  expect(choices("● Yes / ○ No")).toEqual(choices("Yes / No"));
});

test("masked input bullets do not become offered choices", () => {
  expect(choices("●●●●")).toEqual(choices("****"));
});

test("state and scenario names remain facts in unlabelled output", () => {
  expect(facts("* laptop   v1.2.3", ["laptop"])).not.toEqual(
    facts("* desktop   v1.2.3", ["laptop"]),
  );

  expect(facts("hello work repo", ["work repo"])).not.toEqual(facts("hello", ["work repo"]));
});

test("known names keep one fact when quoted", () => {
  expect(facts('removed "laptop"', ["laptop"])).toEqual(facts("removed laptop", ["laptop"]));
});

test("grouped commander and cobra help extract entries without wrapped prose", () => {
  const ts = `Usage: envden [options] [command]
Options:
  -h, --help  display help with --verbose examples
Get started:
  setup [options]  Create a vault and configure this device
  join <server>    Join using a pairing code in your
                    own terminal
Daily use:
  push             Send changes
Commands:
  repair           Re-upload this device's data,
                    or finish with --finish
  help [command]   display help
Examples:
  envden setup --example`;

  const go = `Usage:
  envden [command]
Available Commands:
  setup   Create a vault
  join    Join a vault
  push    Send changes
  repair  Repair
  help    Help
Flags:
  -h, --help   help for envden

Use "envden [command] --help" for more information about a command.`;

  expect(help(ts)).toEqual(help(go));

  expect(help(ts)).toEqual(["command:join", "command:push", "command:repair", "command:setup"]);

  expect(help(ts)).not.toEqual(help(go.replace("  repair  Repair\n", "")));
  expect(help(ts)).not.toEqual(help(go.replace("--help", "--verbose")));
});

for (const native of [
  "> Red\n  Blue",
  "  Red\n> Blue",
  "[x] Red\n[ ] Blue",
  "> [•] Red\n  [ ] Blue",
  "• Red\n✓ Blue",
  "\x1b[32m┃ > Red\x1b[0m\n┃   Blue",
])
  test(`native choices match clack: ${native}`, () => {
    expect(choices(native)).toEqual(choices("● Red\n○ Blue"));
    expect(choices(native)).not.toEqual(choices("● Red\n○ Green"));
  });

for (const native of ["> Yes / No", "Yes / No", "┃   Yes     No   "])
  test(`native confirm choices: ${native}`, () => {
    expect(choices(native)).toEqual(choices("│ ● Yes / ○ No"));
    expect(choices(native)).not.toEqual(choices("● Yes"));
  });

test("redrawn and submitted prompts are recorded once in order", async () => {
  const { conversationTurn } = await import("../compare/conversation.ts");
  const ts = "◇ Server address\n│ localhost\n◆ Master password\n│";
  const go = "Server address\nServer address\nMaster password\nMaster password";
  expect(conversation(go)).toEqual(["server address", "master password"]);

  expect(conversationTurn(ts, "secret\r", "server address")).toEqual(
    conversationTurn(go, "secret\r", "server address"),
  );

  expect(conversationTurn(go, "secret\r", "server address").prompts).toEqual(["master password"]);

  expect(conversationTurn(go, "secret\r", "server address")).not.toEqual(
    conversationTurn("Confirm master password", "secret\r"),
  );
});

test("repeated prompts and newly introduced intermediate prompts stay strict", async () => {
  const { conversationTurn } = await import("../compare/conversation.ts");

  expect(conversationTurn("Master password", "secret\r", "master password").prompts).toEqual([
    "master password",
  ]);

  expect(
    conversationTurn("Server address\nPairing code\nMaster password", "secret\r", "server address")
      .prompts,
  ).toEqual(["pairing code", "master password"]);
});

for (const menu of [
  "│ ● Keep\n│ ○ No, discard it",
  "┃ > Keep\n┃   No, discard it",
  "[x] Keep\n[ ] No, discard it",
  "Yes / No",
]) {
  test(`PTY menu rows are choices rather than stdout facts: ${menu}`, () => {
    const result = "Pushed 2 files: /tmp/app/.env";
    const pty = (text: string) => outputObservation(text, "pty", identity);

    expect(pty(`${menu}\n${result}`)).toBe(pty(result));
    expect(pty(`${menu}\n${result}`)).not.toBe(pty(`${menu}\nPushed 2 files`));
    expect(pty(`${menu}\n${result}`)).not.toBe(pty(`${menu}\nPushed 3 files: /tmp/app/.env`));
    expect(choices(menu)).not.toEqual([]);
  });
}

test("PTY confirm redraw answers belong to the conversation", () => {
  const pty = (text: string) => outputObservation(text, "pty", identity);
  const prompt = "◇ Add device-b?\n";

  expect(pty(`${prompt}│ NoYes / ○ No\nPushed 2 files`)).toBe(pty(`${prompt}  No\nPushed 2 files`));

  expect(pty(`${prompt}│ YesYes / ○ No\nPushed 2 files`)).toBe(
    pty(`${prompt}  Yes\nPushed 2 files`),
  );

  expect(pty(`${prompt}│ NoYes / ○ No\nPushed 2 files`)).toBe(pty(`${prompt}Pushed 2 files`));
});

test("JSON output compares object members without losing array order or values", () => {
  const json = (text: string) => outputObservation(text, "json", identity);

  expect(json('{"files":[{"path":".env","state":"changed"}],"configured":true}')).toBe(
    json('{"configured":true,"files":[{"state":"changed","path":".env"}]}'),
  );

  expect(json('{"files":[1,2]}')).not.toBe(json('{"files":[2,1]}'));
  expect(json('{"state":"changed"}')).not.toBe(json('{"state":"held-back"}'));
});

test("parser decoration preserves the invalid value, argument and numeric bounds", () => {
  const ts =
    "error: command-argument value 'invalid' is invalid for argument 'shell'. Allowed choices are zsh, bash.";

  const go = 'error: invalid argument "invalid" for [shell]; allowed choices are zsh, bash';
  const port = "error: option '--port <port>' argument '-1' is invalid. Expected 0 to 65535.";

  expect(observe(ts)).toBe(observe(go));

  expect(observe(ts)).toBe(
    observe("error: invalid value 'invalid' for '[shell]'\n  [possible values: zsh, bash]"),
  );

  expect(observe(ts)).not.toBe(observe(go.replace("[shell]", "[other]")));
  expect(observe(port)).toBe(observe(port.replace("--port <port>", "--port")));
  expect(observe(port)).not.toBe(observe(port.replace("65535", "65536")));
});

test("a text input placeholder is not a menu choice", () => {
  const turn = conversationTurn("Device name?\n> host123", "\r");

  expect(turn.choices).toEqual([]);
  expect(conversationTurn("Remove device?\nYes / No", "y").choices).not.toEqual([]);
});

test("recorded prompt turns do not depend on whether cancellation clears the title", () => {
  const pty = (text: string) => outputObservation(text, "pty", identity, [], ["master password"]);

  expect(pty("Master password\nCancelled")).toBe(pty("Cancelled"));
  expect(pty("Cancelled")).not.toBe(pty("Unlocked"));
  expect(pty("Ready?\nCancelled")).not.toBe(pty("Cancelled"));
});

test("a prompt cancellation footer is decoration, repeated reports remain facts", () => {
  const pty = (text: string) => outputObservation(text, "pty", identity);

  expect(pty("└ Operation cancelled.\nCancelled")).toBe(pty("Cancelled"));
  expect(pty("Cancelled\nCancelled")).not.toBe(pty("Cancelled"));
});

test("a wrapped restore question retains its path and complete summary", () => {
  const one = "Restore <PATH:home-a>/app/.env to version 1? added API_URL; changed TOKEN";
  const wrapped = "┃ Restore <PATH:home-a>/app/.env to\n┃ version 1? added API_URL; changed TOKEN";

  const summaryWrapped =
    "┃ Restore <PATH:home-a>/app/.env to\n┃ version 1? added API_URL;\n┃ changed TOKEN";

  expect(conversation(wrapped)).toEqual(conversation(one));
  expect(conversation(summaryWrapped)).toEqual(conversation(one));
  expect(conversation(summaryWrapped)).not.toEqual(conversation(one.replace("TOKEN", "OTHER")));
  expect(conversation(wrapped)).not.toEqual(conversation(one.replace(".env", ".env.other")));
});
