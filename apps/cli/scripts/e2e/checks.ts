import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IDevice } from "./device.ts";
import { failure } from "./failure.ts";
import { run } from "./run.ts";

export async function inSync(binary: string, device: IDevice, step: string): Promise<void> {
  const output = await run(`${device.name} status`, [binary, "status", "--json"], device.env);

  const report = JSON.parse(output) as {
    configured: boolean;
    server: string;
    serverChecked: boolean;
    files: { state: string }[];
  };

  const problems = [
    !report.configured,
    report.server !== "reachable",
    !report.serverChecked,
    report.files.length === 0,
    report.files.some((file) => file.state !== "in-sync"),
  ];

  if (problems.some(Boolean)) throw failure(`${device.name} is not in sync ${step}`, output);
}

// the human status line is what a user reads, so check its wording too
export async function statusSays(binary: string, device: IDevice, text: string): Promise<void> {
  const output = await run(
    `${device.name} status`,
    [binary, "status"],
    device.env,
    device.checkout,
  );

  if (!output.includes(text)) throw failure(`${device.name} status should say "${text}"`, output);
}

// keys must land in the temp home, never in the runner's real keychain
export async function keysOnDisk(device: IDevice): Promise<void> {
  const keys = await readdir(join(device.env.ENVDEN_HOME!, "state", "keys")).catch(() => []);

  if (!keys.some((name) => name.endsWith(".key")))
    throw failure(`${device.name} stored no keys under ENVDEN_HOME`, keys.join("\n"));
}

export async function same(a: IDevice, b: IDevice, expected: string, step: string): Promise<void> {
  const mine = await readFile(join(a.checkout, ".env"), "utf8");
  const theirs = await readFile(join(b.checkout, ".env"), "utf8").catch(() => "<missing>");

  if (mine !== expected || theirs !== expected)
    throw failure(`.env differs ${step}`, `device-a:\n${mine}\ndevice-b:\n${theirs}`);
}
