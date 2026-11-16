import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IScenario } from "../harness/types.ts";

export default {
  name: "local state edge cases",
  roles: ["device-a", "device-b"],
  async run(c) {
    const empty = await c.device("device-a");
    empty.env.ENVDEN_HOME = "";
    await c.run("device-a", ["status"]);
    await c.run("device-a", ["status", "--json"]);
    await c.run("device-a", ["config", "telemetry", "off"]);

    const aliases = await c.device("device-b");
    const state = join(aliases.env.ENVDEN_HOME!, "state");
    await mkdir(state, { recursive: true });

    await writeFile(
      join(state, "device.json"),
      JSON.stringify({
        format: 1,
        deviceName: "test",
        headerRefs: [],
        entries: [],
        approved: [],
        links: [],
        aliases: {},
        telemetry: false,
        updateCheck: false,
      }),
    );

    for (const target of ["constructor", "toString", "hasOwnProperty", "__proto__"])
      await c.run("device-b", ["alias", "x", target], 3);

    await c.run("device-b", ["alias", "__proto__", "x"]);
    await c.run("device-b", ["alias", "ordinary", "canonical"]);
  },
} satisfies IScenario;
