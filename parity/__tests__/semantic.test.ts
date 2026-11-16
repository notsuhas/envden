import { expect, test } from "bun:test";
import { facts, semanticOutput } from "../harness/terminal/semantic.ts";
import { nextPrompt, promptRecord } from "../harness/terminal/prompts.ts";
import { capture } from "../harness/snapshot.ts";
import { Context } from "../harness/context.ts";

test("restyled notices retain the same ordered facts", () => {
  expect(facts("\x1b[32m└ ✓ Pushed 2 files: .env <id:1:26>\x1b[0m")).toEqual(
    facts("Pushed\n 2 files .env <id:1:26>"),
  );

  expect(facts("invalid argument 'shell'", new Set(["shell"]))).toEqual(
    facts("invalid argument '[shell]'", new Set(["shell"])),
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
  const strict = await capture(c, false, true);
  c.results[0]!.stdout = "└ Pushed   2 files";
  expect(await capture(c, false)).toBe(baseline);
  expect(await capture(c, false, true)).not.toBe(strict);
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

test("JSON identity normalization is independent of object key order", async () => {
  const snapshot = async (stdout: string, stderr = "") => {
    const c = new Context("/tmp/parity-json", {});
    c.results.push({ label: "status --json", stdout, stderr, code: 0 });

    return capture(c, false);
  };

  expect(await snapshot('{"time":1800000000000}')).toBe(await snapshot('{"time":1800000010000}'));
  expect(await snapshot("", '{"a":1,"b":2}')).toBe(await snapshot("", '{"b":2,"a":1}'));
  const a = "A".repeat(52);
  const b = "B".repeat(52);
  const c = "C".repeat(52);
  const d = "D".repeat(52);

  expect(await snapshot(JSON.stringify({ a, b }))).toBe(
    await snapshot(JSON.stringify({ b: d, a: c })),
  );

  expect(await snapshot(JSON.stringify({ a, b: a }))).not.toBe(
    await snapshot(JSON.stringify({ a: c, b: d })),
  );
});

test("repeated questions wait for the active prompt rather than its submitted repaint", () => {
  const submitted = "◇ Wrong master password. Try again\n│ *****\n";
  const pattern = /Wrong master password\. Try again/;
  expect(nextPrompt(submitted, pattern, true)).toBeNull();
  expect(nextPrompt("│ ▪_│ ▪▪_" + submitted, pattern, true)).toBeNull();

  expect(
    nextPrompt(submitted + "◆ Wrong master password. Try again\n│ _\n└", pattern, true)?.index,
  ).toBe(submitted.length + 2);

  expect(nextPrompt("✓ Wrong master password. Try again", pattern, true)).toBeNull();
  expect(nextPrompt("Plain prompt:", /Plain prompt:/, true)?.[0]).toBe("Plain prompt:");
});

test("queued notices retain names and multiplicity when delivery moves between commands", async () => {
  const snapshot = async (first: string, second: string, strict = false) => {
    const c = new Context("/tmp/parity-notice", {});
    c.results.push({ label: "a push", stdout: first, stderr: "", code: 0 });
    c.results.push({ label: "a pull", stdout: second, stderr: "", code: 0 });

    return capture(c, false, strict);
  };

  const notice = "envden: beta joined with the recovery kit\n";

  expect(await snapshot(notice + "Pushed 1", "Pulled 1")).toBe(
    await snapshot("Pushed 1", notice + "Pulled 1"),
  );

  expect(await snapshot(notice, "")).not.toBe(await snapshot(notice.replace("beta", "gamma"), ""));
  expect(await snapshot(notice, "")).not.toBe(await snapshot(notice, notice));
  expect(await snapshot(notice, "")).not.toBe(await snapshot("", ""));
  expect(await snapshot(notice, "", true)).not.toBe(await snapshot("", notice, true));
});

test("PTY JSON retains prompts while comparing the machine result exactly", async () => {
  const snapshot = async (count: number) => {
    const c = new Context("/tmp/parity-mixed-json", {});

    c.results.push({
      label: "a push --json",
      stdout: `◆ Master password\n│ *****\n{"count":${count}}\n`,
      stderr: "",
      code: 0,
      prompts: [],
    });

    return capture(c, false);
  };

  expect(await snapshot(1)).toBe(await snapshot(1));
  expect(await snapshot(1)).not.toBe(await snapshot(2));
});
