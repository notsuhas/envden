import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { Context } from "./context.ts";

export const password = "correct horse battery staple";

export async function setup(c: Context) {
  const server = await c.server();
  await c.device("device-a", "# shared\nTOKEN=one\n");
  const kit = join(c.get("device-a").home, "kit.json");

  const t = c.pty("device-a", [
    "setup",
    "--server",
    server.url,
    "--name",
    "alpha",
    "--kit-out",
    kit,
    "--yes",
  ]);

  await t.expect("Server setup token", `${server.token}\r`);
  await t.expect("Master password", `${password}\r`);
  await t.expect("Confirm master password", `${password}\r`);
  await t.expect("Sync env files for these checkouts", "\r");
  await c.finish("device-a", "setup", t);

  return { server, kit };
}

export async function recoveryJoin(c: Context, server: string, kit: string) {
  await c.device("device-b");
  const t = c.pty("device-b", ["join", server, "--name", "beta", "--recovery-kit", kit, "--yes"]);
  await t.expect("Master password", `${password}\r`);
  await t.expect("Sync env files for these checkouts", "\r");
  await c.finish("device-b", "join recovery", t);
}

export async function kitSecret(path: string): Promise<string> {
  const kit = JSON.parse(await readFile(path, "utf8"));
  if (typeof kit.secretKey !== "string") throw new Error("Kit missing secretKey");

  return kit.secretKey;
}
