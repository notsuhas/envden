import { dirname, join } from "node:path";
import { mkdir, readFile, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { setup } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

type TContext = Parameters<IScenario["run"]>[0];

type TDevice = ReturnType<TContext["get"]>;

async function trackNestedFiles(c: TContext) {
  await setup(c);
  const device = c.get("device-a");
  await mkdir(join(device.checkout, "Dir"));
  await writeFile(join(device.checkout, "Dir/.env"), "FIRST=one\n");
  await writeFile(join(device.checkout, "Dir/.env.local"), "SECOND=two\n");
  const insensitive = await Bun.file(join(device.checkout, "dir/.env")).exists();
  const track = c.pty("device-a", ["track", device.checkout]);
  await c.finish("device-a", "track nested env files", track);

  return { device, insensitive };
}

async function aliasSecondFile(device: TDevice) {
  const statePath = join(device.env.ENVDEN_HOME!, "state/device.json");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const link = state.links.find((item: { path: string }) => item.path === "Dir/.env.local");
  const nextStore = join(dirname(dirname(link.store)), "dir/.env.local");
  await mkdir(dirname(nextStore), { recursive: true });
  await rename(link.store, nextStore);
  await unlink(join(device.checkout, link.path));
  await mkdir(join(device.checkout, "dir"), { recursive: true });
  await symlink(nextStore, join(device.checkout, "dir/.env.local"));
  link.path = "dir/.env.local";
  link.store = nextStore;
  await writeFile(statePath, JSON.stringify(state));
}

async function pullCollision(c: TContext, insensitive: boolean) {
  const pull = await c.run("device-a", ["pull", "--yes", "--json"], insensitive ? 3 : 0);

  if (JSON.parse(pull.stdout).conflicts !== Number(insensitive))
    throw new Error("Directory aliases did not produce the expected collision count");

  const recorded = c.results.at(-1)!;

  recorded.stdout = recorded.stdout.replace(
    /Could not place env file: (?:Dir\/\.env|dir\/\.env\.local)/g,
    "Could not place env file: <COLLIDING_PATH>",
  );
}

async function verifyPreservedFiles(device: TDevice) {
  const files: [string, string][] = [
    ["Dir/.env", "FIRST=one\n"],
    ["dir/.env.local", "SECOND=two\n"],
  ];

  for (const [path, content] of files) {
    if ((await Bun.file(join(device.checkout, path)).text()) !== content)
      throw new Error("Collision changed checkout bytes");
  }
}

export default {
  name: "directory-spelling-collision",
  snapshot: "output",
  roles: ["server", "device-a"],
  async run(c) {
    const { device, insensitive } = await trackNestedFiles(c);
    await aliasSecondFile(device);
    await c.run("device-a", ["push", "--yes", "--json"]);
    await pullCollision(c, insensitive);
    await verifyPreservedFiles(device);
  },
} satisfies IScenario;
