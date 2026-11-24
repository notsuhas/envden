import { spawnTrusted } from "@envden/core/process";
import type { CommandUnknownOpts } from "@commander-js/extra-typings";
import { resolutionChoice } from "../sync/resolve.ts";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProgram } from "../../program.ts";
import { NOT_SET_UP } from "../../state/configured.ts";

const fixtureClock = () => 1800000000000;

async function run(args: string[], home: string, env: Record<string, string | undefined>) {
  const child = spawnTrusted([process.execPath, join(import.meta.dir, "../../main.ts"), ...args], {
    env: {
      ...env,
      HOME: home,
      ENVDEN_HOME: home,
      ENVDEN_TELEMETRY: "0",
      ENVDEN_NO_UPDATE_CHECK: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  return {
    code: await child.exited,
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text(),
  };
}

async function cli(args: string[]) {
  const home = await mkdtemp(join(tmpdir(), "envden-command-"));

  try {
    return await run(args, home, process.env);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

function help(...path: string[]) {
  let command: CommandUnknownOpts = createProgram(fixtureClock);

  for (const name of path) command = command.commands.find((child) => child.name() === name)!;

  return command.helpInformation();
}

test("help lists every command and a fresh home fails each gate with its exit code", async () => {
  const root = help();

  for (const command of [
    "setup",
    "join",
    "push",
    "pull",
    "status",
    "diff",
    "resolve",
    "rm",
    "send",
    "receive",
    "device",
    "server",
    "serve",
    "update",
    "config",
    "agent",
    "shell",
    "doctor",
    "version",
  ])
    expect(root).toMatch(new RegExp(`\\b${command}\\b`));

  const [pushed, status, setup, push, resolve] = await Promise.all([
    cli(["push", "--yes"]),
    cli(["status", "--json"]),
    cli(["setup"]),
    cli(["push"]),
    cli(["resolve", "file", "--keep-mine"]),
  ]);

  expect(pushed.code).toBe(1);
  expect(pushed.stderr).toContain(NOT_SET_UP);
  expect(status.code).toBe(0);
  expect(JSON.parse(status.stdout).configured).toBe(false);
  expect(setup.stderr).toContain("--server <url> or --host-server");
  expect(push.stderr).toContain("--yes");
  expect(resolve.code).toBe(2);
  expect(resolve.stderr).toContain("agent-merge");
});

for (const [keep, take, choice] of [
  [undefined, undefined, "edit"],
  [true, false, "keep-mine"],
  [false, true, "take-server"],
] as const)
  test(`resolution choice ${keep} ${take}`, () => {
    expect(resolutionChoice(keep, take)).toBe(choice);
  });

test("commands that make a recovery code offer a private file for scripts", () => {
  for (const path of [["setup"], ["vault", "recovery-code"], ["device", "rm"]])
    expect(help(...path)).toContain("--recovery-code-out");
});

test("human status keeps notice lines and diagnostics survive unreadable state", async () => {
  const { atomicWrite } = await import("../../state/store/files.ts");
  const { saveUpdateCache } = await import("../../updates/cache.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-command-state-"));

  try {
    await saveUpdateCache(home, { message: "Cannot confirm envden is up to date" }, fixtureClock);
    const status = await run(["status"], home, {});

    expect(status.code).toBe(0);

    expect(status.stdout.trim().split("\n")).toEqual([
      NOT_SET_UP,
      "Cannot confirm envden is up to date",
    ]);

    await atomicWrite(join(home, "state", "device.json"), "{", fixtureClock);

    expect((await run(["config"], home, {})).code).toBe(0);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("secret-prompt commands no longer recommend piped tokens", () => {
  for (const path of [["setup"], ["server", "move"], ["server", "repair"]]) {
    const text = help(...path);

    expect(text).not.toContain("prefer stdin or the prompt");
    expect(text).toContain("terminal");
  }
});

function everyCommand(command: CommandUnknownOpts): CommandUnknownOpts[] {
  return [command, ...command.commands.flatMap(everyCommand)];
}

async function parserError(args: string[]) {
  const program = createProgram(fixtureClock);
  const written: string[] = [];

  for (const command of everyCommand(program))
    command.exitOverride().configureOutput({ writeErr: (text) => written.push(text) });

  await Promise.resolve(expect(program.parseAsync(args, { from: "user" })).rejects.toThrow());

  return written.join("");
}

test("parser errors keep their line breaks and strip control bytes at every depth", async () => {
  expect(await parserError(["statu"])).toBe(
    "error: unknown command 'statu'\n(Did you mean status?)\n",
  );

  expect(await parserError(["\x1b[2Jstatu\nforged"])).toBe(
    "error: unknown command '[2Jstatuforged'\n",
  );

  expect(await parserError(["rm", "--yesx", ".env"])).toBe(
    "error: unknown option '--yesx'\n(Did you mean --yes?)\n",
  );

  expect(await parserError(["rm", "--x\x1b[31mred", ".env"])).toBe(
    "error: unknown option '--x[31mred'\n",
  );

  expect(await parserError(["device", "ls", "--\x1b]0;title\x07"])).toBe(
    "error: unknown option '--]0;title'\n",
  );
});

test("parser errors never echo a share link's key", async () => {
  const link = "https://n.t.ts.net:10000/s/AAAAAAAAAAAAAAAAAAAAAA#dummy-key";
  const masked = "https://n.t.ts.net:10000/s/AAAAAAAAAAAAAAAAAAAAAA#[redacted]";

  expect(await parserError(["receive", link, "a", "b"])).toBe(
    `error: too many arguments for 'receive'. Expected 2 arguments but got 3: ${masked}, a, b.\n`,
  );

  expect(await parserError([link])).toBe(`error: unknown command '${masked}'\n`);

  expect(await parserError([link.replace("#", "#\t")])).toBe(
    `error: unknown command '${masked}'\n`,
  );

  expect(await parserError(["receive", link.replace("//", ""), "a", "b"])).toBe(
    `error: too many arguments for 'receive'. Expected 2 arguments but got 3: ${masked.replace("//", "")}, a, b.\n`,
  );
});
