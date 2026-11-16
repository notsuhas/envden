import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { TContext } from "../../runtime/context.ts";
import { cli, edit } from "../steps/cli.ts";
import { password, setup } from "../steps/onboarding.ts";
import type { IScenario, IStep } from "../types.ts";

function backup(c: TContext): string {
  return join(c.root, "backup");
}

function finish(acceptLost: boolean): IStep {
  return {
    name: `finish repair${acceptLost ? " accepting lost versions" : ""}`,
    run: async (c) => {
      const result = await c.pty(
        "a",
        ["server", "repair", "--finish", ...(acceptLost ? ["--accept-lost"] : [])],
        [
          { expect: "Repair token", send: `${c.servers.get("main")!.token}\r` },
          { expect: "Master password", send: `${password}\r` },
        ],
      );

      const expected = acceptLost ? "recovered from" : "No device has the newest version";

      if (!result.stdout.includes(expected)) throw new Error("Missing lost-version outcome");
    },
  };
}

export const lost: IScenario = {
  name: "server-repair-lost",
  roles: ["server", "a"],

  needs: "stand-in",
  steps: [
    ...setup(),
    {
      name: "back up the server",
      run: async (c) => {
        const directory = c.servers.get("main")!.directory;

        await c.stop("main");
        await cp(directory, backup(c), { recursive: true });
        await c.serve("main");
      },
    },
    edit("a", "TOKEN=lost-version\n"),
    cli("a", ["push", "--yes"]),
    {
      name: "restore the backup and drop the device blob cache",
      run: async (c) => {
        const directory = c.servers.get("main")!.directory;

        await c.stop("main");
        await rm(directory, { recursive: true });
        await cp(backup(c), directory, { recursive: true });
        await rm(join(c.get("a").env.ENVDEN_HOME, "state", "blobs"), { recursive: true });
      },
    },
    {
      name: "upload the repair report",
      run: async (c) => {
        await c.serve("main", true);
        await c.cli("a", ["server", "repair"], 0, `${c.servers.get("main")!.token}\n`);
      },
    },
    finish(false),
    finish(true),
    cli("a", ["status", "--json"]),
  ],
};
