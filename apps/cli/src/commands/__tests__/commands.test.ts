import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function cli(args: string[]) {
  const home = await mkdtemp(join(tmpdir(), "envden-command-"));

  const child = Bun.spawn([process.execPath, join(import.meta.dir, "../../main.ts"), ...args], {
    env: { ...process.env, ENVDEN_HOME: home },
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
    "alias",
    "device",
    "server",
    "serve",
    "update",
    "config",
    "agent",
    "doctor",
    "version",
  ])
    expect(help.stdout).toContain(command);

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
  expect((await cli(["config", "allow-version", "1.0.0"])).stderr).toContain("own terminal");
});
