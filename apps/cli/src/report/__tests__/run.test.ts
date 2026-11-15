import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { PromptCancelled } from "../../state/cancelled.ts";
import { NEW_ISSUE_URL } from "../content/issue.ts";
import { reportProblem } from "../run.ts";

const TOKEN =
  "043GE1R70W3GE1R70W3GE1R70W3GE1R70W4GJ289144GJ289144GJ289144GJ289144GJ289144GJ289144GJ";

async function scenario(choice: string | Error, env: Record<string, string> = {}) {
  const userHome = await mkdtemp(join(tmpdir(), "report-"));
  const home = join(userHome, ".envden");
  await mkdir(home);
  await writeFile(join(home, "server.log"), `Setup token:\n  ${TOKEN}\nenvden listening\n`);

  const calls = {
    offered: [] as string[],
    launched: [] as string[][],
    opened: [] as string[],
    printed: [] as string[],
  };

  await reportProblem(
    new EnvdenError("INVALID_DATA", "Unreadable config"),
    { home, userHome, now: () => 0 },
    {
      env,
      interactive: true,
      argv: ["join", "--setup-token", TOKEN],
      which: (command) => (command === "claude" ? "/bin/claude" : null),
      choose: async (_message, options) => {
        calls.offered = options.map((option) => option.label);
        if (choice instanceof Error) throw choice;

        return choice as never;
      },
      launch: async (command) => void calls.launched.push(command),
      open: async (url) => (calls.opened.push(url), false),
      print: (line) => void calls.printed.push(line),
    },
  );

  return { ...calls, report: join(home, "reports", "1970-01-01T00-00-00-000Z.md"), home };
}

test("choosing an agent writes a private redacted report and starts the agent on it", async () => {
  const { offered, launched, report, home } = await scenario("claude");
  const document = await readFile(report, "utf8");

  expect(offered).toHaveLength(3);
  expect(offered[0]).toContain("Claude Code");

  expect(document).toContain("- Command: envden join --setup-token [redacted]");
  expect(document).toContain("~~~\nSetup token:\n  [setup token]\nenvden listening\n~~~");
  expect(document).not.toContain(TOKEN);
  expect((await stat(report)).mode & 0o777).toBe(0o600);
  expect((await stat(join(home, "reports"))).mode & 0o777).toBe(0o700);
  expect(launched).toEqual([["/bin/claude", expect.stringContaining(`report is at ${report}.`)]]);
});

test("the browser fallback opens a pre-filled issue and says what to do when it can't", async () => {
  const { opened, printed } = await scenario("browser");

  expect(new URL(opened[0]!).searchParams.get("title")).toBe("envden join fails with INVALID_DATA");
  expect(printed.at(-1)).toContain(NEW_ISSUE_URL);
});

test("declining, cancelling or running inside an agent writes nothing", async () => {
  const runs = [
    scenario("no"),
    scenario(new PromptCancelled()),
    scenario("claude", { CLAUDECODE: "1" }),
  ];

  for (const { printed, report } of await Promise.all(runs)) {
    expect(printed).toEqual([]);
    expect(await stat(report).catch(() => undefined)).toBeUndefined();
  }

  expect((await runs[2]!).offered).toEqual([]);
});
