import type { IScenario } from "../harness/types.ts";

export default {
  name: "settings",
  roles: ["device-a"],
  async run(c) {
    await c.device("device-a");

    for (const args of [
      ["config"],
      ["config", "telemetry", "off"],
      ["config", "update-check", "off"],
      ["config", "agent-merge", "off"],
      ["config", "env-files"],
      ["config"],
    ])
      await c.run("device-a", args);

    for (const shell of ["zsh", "bash", "fish", "powershell"]) {
      await c.run("device-a", ["shell", "install", shell]);
      await c.run("device-a", ["shell", "install", shell]);
      await c.run("device-a", ["shell", "uninstall", shell]);
    }

    await c.run("device-a", ["agent", "install"]);
    await c.run("device-a", ["status"]);
    await c.run("device-a", ["status", "--json"]);
  },
} satisfies IScenario;
