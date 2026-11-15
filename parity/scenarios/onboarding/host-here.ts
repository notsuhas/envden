import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "host-here",
  roles: ["server", "device-a"],
  async run(c) {
    await setup(c);
    await c.run("device-a", ["setup", "--host-server", "--yes"]);
    await c.run("device-a", ["setup", "--host-server", "--yes"]);

    const log = await readFile(join(c.get("device-a").home, "host-tools.log"), "utf8");

    for (const operation of ["daemon-reload", "enable", "restart", "serve"])
      if (!log.includes(operation)) throw new Error(`Missing host operation: ${operation}`);
  },
} satisfies IScenario;
