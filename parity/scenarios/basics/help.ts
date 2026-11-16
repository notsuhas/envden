import { cli } from "../steps/cli.ts";
import type { IScenario } from "../types.ts";

const commands = [
  "",
  "setup",
  "join",
  "status",
  "push",
  "pull",
  "diff",
  "resolve",
  "history",
  "track",
  "untrack",
  "local-only",
  "rm",
  "alias",
  "device",
  "device ls",
  "device add",
  "device rm",
  "device rename",
  "unlock",
  "vault",
  "vault rotate",
  "vault kit",
  "vault kit replace",
  "vault password",
  "vault password change",
  "vault password reset",
  "server",
  "server move",
  "server switch",
  "server repair",
  "config",
  "doctor",
  "version",
  "serve",
  "update",
  "ui",
  "agent",
  "agent install",
  "shell",
  "shell install",
  "shell uninstall",
].map((command) => command.split(" ").filter(Boolean));

export const help: IScenario = {
  name: "help",
  roles: ["a"],
  steps: [
    {
      name: "isolated device",
      run: async (c) => {
        await c.device("a");
      },
    },
    ...commands.map((command) => cli("a", [...command, "--help"])),
    ...commands.map((command) => cli("a", [...command, "--version"])),
  ],
};
