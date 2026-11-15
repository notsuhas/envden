import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { password } from "../../harness/onboarding.ts";
import type { Context } from "../../harness/context.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "rejoin-after-removal",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server, kit } = await prepare(c);

    for (const mode of ["kit", "pairing"]) {
      const remove = c.pty("device-a", ["device", "rm", "beta"]);
      await remove.expect("Master password", `${password}\r`);
      await remove.expect("Remove this device?", "y");

      await remove.expect(
        "This device held recovery keys. Replace the recovery kit in this removal?",
        "\r",
      );

      await c.finish("device-a", `remove before ${mode} rejoin`, remove);
      await joinAgain(c, { address: server.url, kit, mode });
      await c.run("device-b", ["device", "ls", "--json"]);
    }

    for (const result of c.results)
      result.stdout = result.stdout.replace(/^envden: beta joined with the recovery kit\n/gm, "");
  },
} satisfies IScenario;

async function prepare(c: Context) {
  const server = await c.server();
  await c.device("device-a");
  const home = c.get("device-a").home;
  const scan = join(home, "empty-scan");
  const kit = join(home, "kit.json");
  await mkdir(scan);
  const setup = c.pty("device-a", [
    "setup",
    "--server",
    server.url,
    "--name",
    "alpha",
    "--kit-out",
    kit,
    "--yes",
    "--scan-root",
    scan,
  ]);
  await setup.expect("Server setup token", `${server.token}\r`);
  await setup.expect("Master password", `${password}\r`);
  await setup.expect("Confirm master password", `${password}\r`);
  await c.finish("device-a", "setup", setup);
  await c.device("device-b");
  const recovery = c.pty("device-b", [
    "join",
    server.url,
    "--name",
    "beta",
    "--recovery-kit",
    kit,
    "--yes",
  ]);
  await recovery.expect("Master password", `${password}\r`);
  await c.finish("device-b", "join recovery", recovery);

  return { server, kit };
}

interface IRejoin {
  address: string;
  kit: string;
  mode: string;
}

async function joinAgain(c: Context, options: IRejoin) {
  const args = ["join", options.address, "--name", "beta", "--yes"];
  if (options.mode === "kit") args.push("--recovery-kit", options.kit);
  const join = c.pty("device-b", args);

  if (options.mode === "kit") await join.expect("Master password", `${password}\r`);
  else {
    const add = c.pty("device-a", ["device", "add"]);
    await add.expect("Master password", `${password}\r`);
    const code = await add.expect(/\b(\d{1,3}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/);
    await join.expect("Pairing code", `${code}\r`);
    await add.expect("Add ", "y");
    await c.finish("device-a", "approve pairing rejoin", add);
  }

  await c.finish("device-b", `${options.mode} rejoin`, join);
}
