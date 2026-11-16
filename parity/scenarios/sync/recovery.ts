import { known } from "../known.ts";
import { cli, edit, reports } from "../steps/cli.ts";
import { joinKit, setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

export const recovery: IScenario = {
  name: "recovery-sync",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup(),
    joinKit(),
    ...reports,
    cli("b", ["status"]),
    cli("b", ["status", "--json"]),
    edit("b", "# edited\nTOKEN=kit-joined\nEMPTY=\n"),
    cli("b", ["diff"]),
    cli("b", ["diff", "--json"]),
    cli("b", ["push", "--yes"]),
    cli("a", ["pull", "--yes"]),
    cli("a", ["history", ".env", "--json"]),
    cli("a", ["history", ".env", "--restore", "1", "--yes"], 2),
    {
      name: "restore in a terminal",
      run: async (c) => {
        await c.pty("a", ["history", ".env", "--restore", "1", "--yes", "--json"], []);
      },
    },
    {
      name: "allow scripted restore",
      run: async (c) => {
        await c.pty("a", ["config", "agent-merge", "on"], []);
      },
    },
    cli(
      "a",
      ["history", ".env", "--restore", "9999999999999999", "--yes"],
      known.hugeRestoreVersion,
    ),
    cli("a", ["history", ".env", "--restore", "2", "--yes"]),
    cli("a", ["rm", ".env", "--yes", "--json"]),
    cli("a", ["push", "--yes"]),
    cli("b", ["pull", "--yes"]),
    cli("b", ["status", "--json"]),
  ],
};
