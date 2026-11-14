import { spawnTrusted } from "@envden/core/process";
import { resolutionChoice } from "../sync/resolve.ts";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function cli(args: string[]) {
  const home = await mkdtemp(join(tmpdir(), "envden-command-"));

  const child = spawnTrusted([process.execPath, join(import.meta.dir, "../../main.ts"), ...args], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      ENVDEN_HOME: home,
      ENVDEN_KEYCHAIN: "file",
      ENVDEN_TELEMETRY: "0",
      ENVDEN_NO_UPDATE_CHECK: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  const result = {
    code: await child.exited,
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text(),
  };

  await rm(home, { recursive: true, force: true });

  return result;
}

test("command help and shared stub exit", async () => {
  const help = await cli(["--help"]);
  expect(help.code).toBe(0);

  for (const command of [
    "setup",
    "join",
    "push",
    "pull",
    "status",
    "diff",
    "resolve",
    "rm",
    "alias",
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
    expect(help.stdout).toMatch(new RegExp(`\\b${command}\\b`));

  for (const args of [
    ["pull", "--all"],
    ["push", "--yes"],
  ]) {
    const result = await cli(args);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("setup or join first");
  }

  const status = await cli(["status", "--json"]);
  expect(status.code).toBe(0);
  expect(JSON.parse(status.stdout).configured).toBe(false);
});

test("noninteractive safety gates", async () => {
  expect((await cli(["setup"])).stderr).toContain("Missing choices:");
  expect((await cli(["push"])).stderr).toContain("requires --yes");
});

for (const [keep, take, choice] of [
  [undefined, undefined, "edit"],
  [true, false, "keep-mine"],
  [false, true, "take-server"],
] as const)
  test(`resolution choice ${keep} ${take}`, () => {
    expect(resolutionChoice(keep, take)).toBe(choice);
  });

test("unattended resolution lists the terminal and agent override choices", async () => {
  const result = await cli(["resolve", "file", "--keep-mine"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("agent-merge");
});

test("replacement commands offer private kit files", async () => {
  for (const args of [
    ["vault", "kit", "replace", "--help"],
    ["device", "rm", "--help"],
  ]) {
    expect((await cli(args)).stdout).toContain("--kit-out");
  }
});

test("human status keeps notice lines and diagnostics survive unreadable state", async () => {
  const { atomicWrite } = await import("../../state/store/files.ts");
  const { saveUpdateCache } = await import("../../updates/cache.ts");
  const home = await mkdtemp(join(tmpdir(), "envden-command-state-"));

  try {
    await saveUpdateCache(home, { message: "Cannot confirm envden is up to date" });

    for (const command of ["status", "config"]) {
      if (command !== "status") await atomicWrite(join(home, "state", "device.json"), "{");

      const child = spawnTrusted(
        [process.execPath, join(import.meta.dir, "../../main.ts"), command],
        {
          env: {
            HOME: home,
            USERPROFILE: home,
            ENVDEN_HOME: home,
            ENVDEN_KEYCHAIN: "file",
            ENVDEN_TELEMETRY: "0",
            ENVDEN_NO_UPDATE_CHECK: "1",
          },
          stdout: "pipe",
          stderr: "pipe",
          stdin: "ignore",
        },
      );

      const stdout = await new Response(child.stdout).text();
      expect(await child.exited).toBe(0);

      if (command === "status")
        expect(stdout.trim().split("\n")).toEqual([
          "envden: not configured",
          "Cannot confirm envden is up to date",
        ]);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("secret-prompt commands no longer recommend piped tokens", async () => {
  for (const args of [
    ["setup", "--help"],
    ["server", "move", "--help"],
    ["server", "repair", "--help"],
  ]) {
    const result = await cli(args);
    expect(result.stdout).not.toContain("prefer stdin or the prompt");
    expect(result.stdout).toContain("terminal");
  }
});
