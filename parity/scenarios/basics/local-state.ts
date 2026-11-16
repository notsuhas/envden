import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { known } from "../known.ts";
import { cli } from "../steps/cli.ts";
import type { IScenario } from "../types.ts";

const state = {
  format: 1,
  deviceName: "test",
  headerRefs: [],
  entries: [],
  approved: [],
  links: [],
  aliases: {},
  telemetry: false,
  updateCheck: false,
};

const targets = ["constructor", "toString", "hasOwnProperty", "__proto__"];

export const localState: IScenario = {
  name: "local-state",
  roles: ["a", "b"],
  steps: [
    {
      name: "empty ENVDEN_HOME",
      run: async (c) => {
        const empty = await c.device("a");

        empty.env.ENVDEN_HOME = "";
      },
    },
    cli("a", ["status"]),
    cli("a", ["status", "--json"]),
    cli("a", ["config", "telemetry", "off"]),
    {
      name: "device state without a vault",
      run: async (c) => {
        const directory = join((await c.device("b")).env.ENVDEN_HOME, "state");

        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, "device.json"), JSON.stringify(state));
      },
    },
    ...targets.map((target) => cli("b", ["alias", "x", target], known.prototypeAliasTarget)),
    cli("b", ["alias", "__proto__", "x"]),
    cli("b", ["alias", "ordinary", "canonical"]),
  ],
};
