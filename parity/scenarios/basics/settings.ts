import { cli } from "../steps/cli.ts";
import type { IScenario } from "../types.ts";

const shells = ["zsh", "bash", "fish", "powershell"].flatMap((shell) => [
  cli("a", ["shell", "install", shell]),
  cli("a", ["shell", "install", shell]),
  cli("a", ["shell", "uninstall", shell]),
]);

export const settings: IScenario = {
  name: "settings",
  roles: ["a"],
  steps: [
    {
      name: "isolated device",
      run: async (c) => {
        await c.device("a");
      },
    },
    ...shells,
    cli("a", ["agent", "install"]),
    cli("a", ["agent", "install"]),
    cli("a", ["update", "--post-install"]),
    cli("a", ["status"]),
    cli("a", ["status", "--json"]),
  ],
};
