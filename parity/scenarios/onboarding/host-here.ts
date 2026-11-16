import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cli } from "../steps/cli.ts";
import { setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

// Runs only on a disposable Linux CI runner with the host shims installed.
export const hostHere: IScenario = {
  name: "host-here",
  roles: ["server", "a"],
  needs: "stand-in",
  hostShims: true,
  steps: [
    ...setup(),
    cli("a", ["setup", "--host-server", "--yes"]),
    cli("a", ["setup", "--host-server", "--yes"]),
    {
      name: "host tools ran",
      run: async (c) => {
        const log = await readFile(join(c.get("a").home, "host-tools.log"), "utf8");

        for (const operation of ["daemon-reload", "enable", "restart", "serve"])
          if (!log.includes(operation)) throw new Error(`Missing host operation: ${operation}`);
      },
    },
  ],
};
