import { expect, test } from "bun:test";
import { outputObservation } from "../compare/output.ts";
import { choices, conversation } from "../compare/conversation.ts";
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
