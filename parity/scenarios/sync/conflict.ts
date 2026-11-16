import { writeFile } from "node:fs/promises";
import { cli, edit } from "../steps/cli.ts";
import { joinKit, setup } from "../steps/onboarding.ts";
import type { IScenario, IStep } from "../types.ts";

type TChoice = "edit" | "--keep-mine" | "--take-server";

function conflictFile(stdout: string): string {
  const data: unknown = JSON.parse(stdout);

  if (!Array.isArray(data) || typeof data[0]?.file !== "string")
    throw new Error("No conflict file");

  return data[0].file;
}

function resolve(choice: TChoice): IStep {
  return {
    name: "resolve conflict",
    run: async (c) => {
      if (choice !== "edit") {
        await c.pty("b", ["config", "agent-merge", "on"], []);
        await c.cli("b", ["resolve", choice]);

        return;
      }

      await c.cli("b", ["resolve"], 2);

      const output = await c.cli("b", ["resolve", "--list", "--json"]);
      const contents = "TOKEN=agreed\n";

      c.normalizer.literal(contents);
      await writeFile(conflictFile(output.stdout), contents);
      await c.cli("b", ["resolve"]);
    },
  };
}

function conflict(choice: TChoice): IScenario {
  return {
    name: `conflict-${choice.replace("--", "")}`,
    roles: ["server", "a", "b"],

    needs: "stand-in",
    steps: [
      ...setup(),
      joinKit(),
      edit("a", "TOKEN=from-a\n"),
      edit("b", "TOKEN=from-b\n"),
      cli("a", ["push", "--yes"]),
      cli("b", ["pull", "--yes"], 3),
      cli("b", ["status"]),
      cli("b", ["resolve", "--list"]),
      cli("b", ["resolve", "--list", "--json"]),
      resolve(choice),
      cli("b", ["push", "--yes"]),
      cli("a", ["pull", "--yes"]),
      cli("a", ["status", "--json"]),
    ],
  };
}

export const conflicts = [conflict("edit"), conflict("--keep-mine"), conflict("--take-server")];
