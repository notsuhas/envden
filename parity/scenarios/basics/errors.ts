import { known } from "../known.ts";
import { preferences } from "../steps/onboarding.ts";
import { cli } from "../steps/cli.ts";
import type { IScenario } from "../types.ts";

const unconfigured: [string[], number][] = [
  [["push", "--yes"], 1],
  [["pull", "--yes"], 1],
  [["diff"], 1],
  [["resolve", "--list"], 0],
  [["device", "ls"], 1],
  [["device", "rename", "new-name"], 1],
  [["local-only", ".env"], 1],
  [["rm", ".env", "--yes"], 1],
  [["join", "http://127.0.0.1:1"], 1],
  [["server", "move"], 2],
  [["shell", "install", "invalid"], 1],
  [["serve", "--port", "-1"], 1],
  [["serve", "--port", "65536"], 1],
];

const settings: [string[], number][] = [
  [["config"], 0],
  [["config", "telemetry", "off"], 0],
  [["config", "telemetry"], 0],
  [["config", "telemetry", "maybe"], 2],
  [["config", "update-check", "off"], 0],
  [["config", "agent-merge", "off"], 0],
  [["config", "env-files"], 0],
  [["config", "env-files", '{"include":["[ab].env"],"exclude":[]}'], known.unsupportedPattern],
  [["config", "env-files"], 0],
  [["config", "bad-key"], 2],
  [["config", "unknown", "value"], 2],
];

export const errors: IScenario = {
  name: "errors-config",
  roles: ["a"],
  // setup checks tailnet HTTPS before validating its other options.
  needs: "isolated",
  steps: [
    {
      name: "isolated device",
      run: async (c) => {
        await c.device("a");
      },
    },
    cli("a", ["version"]),
    cli("a", ["--version"]),
    cli("a", ["unknown-command"], 1),
    cli("a", ["statu"], 1),
    cli("a", ["\x1b[31mstatu"], 1),
    cli("a", ["status", "--unknown-option"], 1),
    cli("a", ["device", "\x1b[2Jbogus"], 1),
    cli("a", ["device", "rename", "--\x1b[31mbogus"], 1),
    cli("a", ["setup"], 2),
    cli("a", ["setup", "--yes"], 2),
    cli(
      "a",
      [
        "setup",
        "--yes",
        "--server",
        "http://127.0.0.1:1",
        "--setup-token",
        "invalid",
        "--name",
        "device-a",
        ...preferences,
      ],
      2,
    ),
    ...unconfigured.map(([args, code]) => cli("a", args, code)),
    ...settings.map(([args, code]) => cli("a", args, code)),
    cli("a", ["doctor", "--json"]),
  ],
};
