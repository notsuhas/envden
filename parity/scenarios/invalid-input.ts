import type { IScenario } from "../harness/types.ts";

export default {
  name: "invalid-input",
  roles: ["device-a"],
  async run(c) {
    await c.device("device-a");

    const cases: [string[], number][] = [
      [["serve", "--port", "-1"], 1],
      [["serve", "--port", "65536"], 1],
      [["config", "unknown", "value"], 2],
      [["config", "telemetry", "maybe"], 2],
      [["join", "http://127.0.0.1:1"], 1],
      [["server", "move"], 2],
      [["shell", "install", "invalid"], 1],
      [["push", "--yes"], 1],
      [["pull", "--yes"], 1],
      [["diff"], 1],
      [["resolve", "--list"], 0],
      [["device", "ls"], 1],
      [["device", "rename", "new-name"], 1],
      [["local-only", ".env"], 1],
      [["rm", ".env", "--yes"], 1],
    ];

    for (const [args, code] of cases) await c.run("device-a", args, code);
  },
} satisfies IScenario;
