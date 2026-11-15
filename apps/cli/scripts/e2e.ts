import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inSync, keysOnDisk, same, statusSays } from "./e2e/checks.ts";
import { conflictRound } from "./e2e/conflict.ts";
import { createDevice } from "./e2e/device.ts";
import { joinLikeAUser, setupLikeAUser } from "./e2e/onboarding.ts";
import { run } from "./e2e/run.ts";
import { startServer, type IServer } from "./e2e/server.ts";

const binary = resolve(process.argv[2] ?? "apps/cli/dist/envden");
const root = await mkdtemp(join(tmpdir(), "envden-e2e-"));
const password = "correct horse battery staple";

const original =
  "# shared settings\nAPI_URL=https://api.example.com\n\n# keep this blank line above\nTOKEN=one\n";

const edited =
  "# shared settings\nAPI_URL=https://api.example.com\n\n\n# edited on device A\nTOKEN=two # inline note\nNEW_KEY=\n";

// the path a new user walks, answered the way they would: no flags, defaults, Enter
async function main(server: IServer): Promise<void> {
  const a = await createDevice(root, "device-a", original);
  const b = await createDevice(root, "device-b");

  await setupLikeAUser(binary, a, server, password);
  await keysOnDisk(a);
  await inSync(binary, a, "after setup");

  await joinLikeAUser(binary, a, b, server, password);
  await keysOnDisk(b);
  await same(a, b, original, "after join");

  await writeFile(join(a.checkout, ".env"), edited);
  await statusSays(binary, a, "Changed here");
  await run("device-a push", [binary, "push", "--yes"], a.env, a.checkout);
  await statusSays(binary, b, "Newer on server");
  await run("device-b pull", [binary, "pull", "--yes"], b.env, b.checkout);
  await same(a, b, edited, "after push and pull");
  await inSync(binary, a, "after push");
  await inSync(binary, b, "after pull");

  await conflictRound(binary, a, b);
  await inSync(binary, a, "after the conflict");
  await inSync(binary, b, "after the conflict");
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
