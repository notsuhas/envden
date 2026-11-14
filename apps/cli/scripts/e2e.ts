import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDevice, type IDevice } from "./e2e/device.ts";
import { failure } from "./e2e/failure.ts";
import { PtySession } from "./e2e/pty.ts";
import { run } from "./e2e/run.ts";
import { startServer, type IServer } from "./e2e/server.ts";

const binary = resolve(process.argv[2] ?? "apps/cli/dist/envden");
const root = await mkdtemp(join(tmpdir(), "envden-e2e-"));
const password = "correct horse battery staple";

const preferences = [
  "--telemetry",
  "off",
  "--update-check",
  "off",
  "--shell",
  "none",
  "--agent",
  "off",
];

const original =
  "# shared settings\nAPI_URL=https://api.example.com\n\n# keep this blank line above\nTOKEN=one\n";

const edited =
  "# shared settings\nAPI_URL=https://api.example.com\n\n\n# edited on device A\nTOKEN=two # inline note\nNEW_KEY=\n";

function unlinked(link: { status: string; conflict: boolean }): boolean {
  return link.status !== "linked" || link.conflict;
}

async function inSync(device: IDevice, step: string): Promise<void> {
  const output = await run(`${device.name} status`, [binary, "status", "--json"], device.env);

  const report = JSON.parse(output) as {
    configured: boolean;
    server: string;
    repos: string[];
    links: { status: string; conflict: boolean }[];
  };

  const problems = [
    !report.configured,
    report.server !== "reachable",
    report.repos.length > 0,
    report.links.length === 0,
    report.links.some(unlinked),
  ];

  if (problems.some(Boolean)) throw failure(`${device.name} is not in sync ${step}`, output);
}

// keys must land in the temp home, never in the runner's real keychain
async function keysOnDisk(device: IDevice): Promise<void> {
  const keys = await readdir(join(device.env.ENVDEN_HOME!, "state", "keys")).catch(() => []);

  if (!keys.some((name) => name.endsWith(".key")))
    throw failure(`${device.name} stored no keys under ENVDEN_HOME`, keys.join("\n"));
}

async function same(a: IDevice, b: IDevice, expected: string, step: string): Promise<void> {
  const mine = await readFile(join(a.checkout, ".env"), "utf8");
  const theirs = await readFile(join(b.checkout, ".env"), "utf8").catch(() => "<missing>");

  if (mine !== expected || theirs !== expected)
    throw failure(`.env differs ${step}`, `device-a:\n${mine}\ndevice-b:\n${theirs}`);
}

async function main(server: IServer): Promise<void> {
  const a = await createDevice(root, "device-a", original);
  const b = await createDevice(root, "device-b");

  const setup = new PtySession({
    label: "device-a setup",
    binary,
    env: a.env,
    args: [
      "setup",
      "--server",
      server.url,
      "--setup-token",
      server.token,
      "--name",
      a.name,
      "--kit-out",
      join(root, "kit.json"),
      "--scan-root",
      a.home,
      ...preferences,
    ],
  });

  await setup.steps([
    { expect: "Master password", send: `${password}\r` },
    { expect: "Confirm master password", send: `${password}\r` },
    { expect: "Approve checkouts to track", send: " \r" },
  ]);

  await setup.succeeds();
  await keysOnDisk(a);
  await inSync(a, "after setup");

  const add = new PtySession({
    label: "device-a device add",
    binary,
    env: a.env,
    args: ["device", "add"],
  });

  await add.steps([{ expect: "Master password", send: `${password}\r` }]);
  const code = await add.expect(/\b(\d{1,3}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/);

  const joining = new PtySession({
    label: "device-b join",
    binary,
    env: b.env,
    args: ["join", server.url, "--name", b.name, ...preferences],
  });

  await joining.steps([{ expect: "Pairing code", send: `${code}\r` }]);
  await add.steps([{ expect: `Add ${b.name}?`, send: "y" }]);
  await add.succeeds();

  await joining.steps([
    { expect: "Approve checkouts to track", send: " \r" },
    { expect: "Joined" },
  ]);

  await joining.succeeds();
  await keysOnDisk(b);
  await same(a, b, original, "after join");

  await writeFile(join(a.checkout, ".env"), edited);
  await run("device-a push", [binary, "push", "--yes"], a.env, a.checkout);
  await run("device-b pull", [binary, "pull", "--yes"], b.env, b.checkout);
  await same(a, b, edited, "after push and pull");
  await inSync(a, "after push");
  await inSync(b, "after pull");
}

const server = await startServer(binary, join(root, "server"), {
  PATH: process.env.PATH ?? "",
  HOME: join(root, "server-home"),
});

try {
  await main(server);
  console.log("E2E passed");
} finally {
  await server.stop();
  if (process.env.E2E_KEEP) console.log(`kept ${root}`);
  else await rm(root, { recursive: true, force: true });
}
