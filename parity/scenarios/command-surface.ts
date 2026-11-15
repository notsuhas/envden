import { commands } from "../harness/commands.ts";
import type { IScenario } from "../harness/types.ts";

export default {
  name: "command-surface",
  roles: ["device-a"],
  async run(c) {
    await c.device("device-a");

    for (const command of commands) {
      const args = command ? command.split(" ") : [];
      await c.run("device-a", [...args, "--help"]);
      await c.run("device-a", [...args, "--version"], 0);
    }

    await c.run("device-a", ["version"]);
    await c.run("device-a", ["not-a-command"], 1);
    await c.run("device-a", ["status", "--unknown-option"], 1);
  },
} satisfies IScenario;
