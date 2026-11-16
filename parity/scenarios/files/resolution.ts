import { realpath, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TContext } from "../../runtime/context.ts";
import { cli, edit } from "../steps/cli.ts";
import { joinKit, setup } from "../steps/onboarding.ts";
import type { IScenario, IStep } from "../types.ts";

function choose(choice: "--keep-mine" | "--take-server"): IStep[] {
  return [
    edit("a", `TOKEN=a${choice}\n`),
    edit("b", `TOKEN=b${choice}\n`),
    cli("a", ["push", "--yes"]),
    cli("b", ["pull", "--yes"], 3),
    {
      name: `resolve ${choice} by file and repo`,
      run: async (c: TContext) => {
        const listed = JSON.parse((await c.cli("b", ["resolve", "--list", "--json"])).stdout);
        const args = ["resolve", listed[0].file, "--repo", await realpath(c.get("b").checkout)];

        await c.cli("b", [...args, choice, "--json"], 2);
        await c.pty("b", [...args, choice, "--json"], []);
      },
    },
    cli("b", ["push", "--yes"]),
    cli("a", ["pull", "--yes"]),
  ];
}

export const resolution: IScenario = {
  name: "resolution-options",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup(),
    joinKit(),
    ...choose("--keep-mine"),
    ...choose("--take-server"),
    {
      name: "detached file keeps mine",
      run: async (c) => {
        const file = join(c.get("b").checkout, ".env");

        await writeFile(file, "TOKEN=store-edit\n");
        await unlink(file);
        c.normalizer.literal("TOKEN=detached-edit\n");
        await writeFile(file, "TOKEN=detached-edit\n");

        await c.pty(
          "b",
          ["pull", "--yes"],
          [{ expect: /Keep mine[\s\S]*Take server[\s\S]*Merge/, send: "\r" }],
        );
      },
    },
    cli("b", ["push", "--yes"]),
    cli("a", ["pull", "--yes"]),
    edit("a", "TOKEN=aligned-server\n"),
    edit("b", "TOKEN=aligned-local\n"),
    cli("a", ["push", "--yes"]),
    cli("b", ["pull", "--yes"], 3),
    edit("b", "TOKEN=aligned-server\n"),
    cli("b", ["pull", "--yes"]),
    cli("b", ["resolve", "--list", "--json"]),
  ],
};
