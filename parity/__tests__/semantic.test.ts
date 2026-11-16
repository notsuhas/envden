import { expect, test } from "bun:test";
import { facts, semanticOutput } from "../harness/terminal/semantic.ts";
import { promptRecord } from "../harness/terminal/prompts.ts";
import { capture } from "../harness/snapshot.ts";
import { Context } from "../harness/context.ts";

test("restyled notices retain the same ordered facts", () => {
  expect(facts("\x1b[32m└ ✓ Pushed 2 files: .env <id:1:26>\x1b[0m")).toEqual(
    facts("Pushed\n 2 files .env <id:1:26>"),
  );

  expect(facts("Device name: alpha")).not.toEqual(facts("Device name: beta"));

  for (const changed of [
    "Pushed 2 files .env.test <id:1:26>",
    "Pushed 3 files .env <id:1:26>",
    "Pushed 2 files .env.prod <id:1:26>",
    "Pushed 2 files .env <id:2:26>",
    "Failed 2 files .env <id:1:26>",
  ])
    expect(facts(changed)).not.toEqual(facts("Pushed 2 files .env <id:1:26>"));
});

test("prompt records preserve the question, choice order and answer", () => {
  const first = promptRecord("◆ Select file\n│ ● .env\n│ ○ .env.prod\n└", "Select file", "\r");

  expect(first).toEqual(
    promptRecord("◇ Select   file\n ● .env\n ○ .env.prod", "Select file", "\r"),
  );

  expect(first).not.toEqual(
    promptRecord("◇ Select file\n ● .env.prod\n ○ .env", "Select file", "\r"),
  );

  expect(first).not.toEqual(
    promptRecord("◇ Select file\n ● .env\n ○ .env.test", "Select file", "\r"),
  );

  expect(first).not.toEqual(
    promptRecord("◇ Select file\n ● .env\n ○ .env.prod", "Select file", "n"),
  );

  expect(first).not.toEqual(
    promptRecord("◇ Select file\n ○ .env\n ● .env.prod", "Select file", "\r"),
  );

  const second = promptRecord("◆ Master password", "Master password", "secret\r");
  expect([first, second]).not.toEqual([second, first]);
});

test("JSON is parsed exactly and help compares command and option sets", () => {
  expect(semanticOutput('{"a":1,"b":2}', "status --json")).toEqual(
    semanticOutput('{"b":2,"a":1}', "status --json"),
  );

  expect(semanticOutput('{"a":2}', "status --json")).not.toEqual(
    semanticOutput('{"a":1}', "status --json"),
  );

  expect(() => semanticOutput("invalid", "status --json")).toThrow();

  const help =
    "Commands:\n  setup  Set up\n  join  Join\nOptions:\n  -h, --help  Help\n  --json  JSON";

  expect(semanticOutput(help, "--help")).toEqual(
    semanticOutput(
      "Options:\n --json Output\n --help, -h Help\nCommands:\n join Whatever\n setup Other",
      "--help",
    ),
  );

  expect(semanticOutput(help.replace("join", "push"), "--help")).not.toEqual(
    semanticOutput(help, "--help"),
  );
});

test("capture keeps exit codes and prompt order exact; strict output retains prose", async () => {
  const c = new Context("/tmp/parity-unit", {});
  c.results.push({ label: "notice", stdout: "✓ Pushed 2 files", stderr: "", code: 0 });
  const baseline = await capture(c, false);
  c.results[0]!.stdout = "└ Pushed   2 files";
  expect(await capture(c, false)).toBe(baseline);
  expect(await capture(c, false, true)).not.toBe(baseline);
  const p = promptRecord("◆ Select file\n● .env\n○ .env.prod", "Select file", "\r");
  const q = promptRecord("◆ Master password", "Master password", "secret\r");
  c.results[0]!.prompts = [p, q];
  const ordered = await capture(c, false);
  c.results[0]!.prompts = [q, p];
  expect(await capture(c, false)).not.toBe(ordered);
  c.results[0]!.prompts = [p, { ...q, answer: "changed\r" }];
  expect(await capture(c, false)).not.toBe(ordered);
  c.results[0]!.prompts = [p, { ...q, choices: ["extra"] }];
  expect(await capture(c, false)).not.toBe(ordered);
  delete c.results[0]!.prompts;
  c.results[0]!.code = 1;
  expect(await capture(c, false)).not.toBe(baseline);
});
