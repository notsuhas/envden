import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IStep, IScenario } from "./types.ts";
import { setup, joinKit, joinPair } from "./onboarding.ts";

export function cli(device: string, args: string[], code = 0): IStep {
  return {
    name: `${device}: ${args.join(" ")}`,
    run: async (c) => {
      await c.cli(device, args, code);
    },
  };
}

export function edit(device: string, contents: string, file = ".env"): IStep {
  return {
    name: `${device}: edit ${file}`,
    run: async (c) => {
      c.normalizer.literal(contents);
      await writeFile(join(c.get(device).checkout, file), contents);
    },
  };
}

const reports = [
  cli("a", ["status"]),
  cli("a", ["status", "--json"]),
  cli("a", ["diff"]),
  cli("a", ["diff", "--json"]),
  cli("a", ["history", ".env"]),
  cli("a", ["history", ".env", "--json"]),
  cli("a", ["doctor", "--json"]),
];

function conflict(choice: "edit" | "--keep-mine" | "--take-server"): IScenario {
  return {
    name: `conflict-${choice.replace("--", "")}`,
    steps: [
      ...setup(),
      joinKit,
      edit("a", "TOKEN=from-a\n"),
      edit("b", "TOKEN=from-b\n"),
      cli("a", ["push", "--yes"]),
      cli("b", ["pull", "--yes"], 3),
      cli("b", ["resolve", "--list", "--json"]),
      {
        name: "resolve conflict",
        run: async (c) => {
          if (choice !== "edit") {
            await c.pty("b", ["config", "agent-merge", "on"], []);
            await c.cli("b", ["resolve", choice]);

            return;
          }

          await c.cli("b", ["resolve"], 2);
          const output = await c.cli("b", ["resolve", "--list", "--json"]);
          const file = conflictFile(output.stdout);

          const contents = "TOKEN=agreed\n";
          c.normalizer.literal(contents);
          await writeFile(file, contents);
          await c.cli("b", ["resolve"]);
        },
      },
      cli("b", ["push", "--yes"]),
      cli("a", ["pull", "--yes"]),
      cli("a", ["status", "--json"]),
    ],
  };
}

export const syncScenarios: IScenario[] = [
  { name: "setup-interactive", steps: [...setup(true), ...reports] },
  {
    name: "pairing-sync",
    steps: [
      ...setup(false, true),
      joinPair,
      edit("a", "# edited\nTOKEN=two\nNEW_KEY=\n"),
      cli("a", ["status"]),
      cli("a", ["push", "--yes"]),
      cli("b", ["status", "--json"]),
      cli("b", ["pull", "--yes"]),
      ...reports,
      {
        name: "check transferred bytes",
        run: async (c) => {
          if (
            (await readFile(join(c.get("b").checkout, ".env"), "utf8")) !==
            "# edited\nTOKEN=two\nNEW_KEY=\n"
          )
            throw new Error("Pull did not transfer fixture");
        },
      },
    ],
  },
  {
    name: "recovery-sync",
    steps: [
      ...setup(),
      joinKit,
      ...reports,
      edit("b", "TOKEN=kit-joined\n"),
      cli("b", ["push", "--yes"]),
      cli("a", ["pull", "--yes"]),
      cli("a", ["history", ".env", "--restore", "1", "--yes"], 2),
      {
        name: "allow scripted restore",
        run: async (c) => {
          await c.pty("a", ["config", "agent-merge", "on"], []);
        },
      },
      cli("a", ["history", ".env", "--restore", "1", "--yes"]),
    ],
  },
  conflict("edit"),
  conflict("--keep-mine"),
  conflict("--take-server"),
];

function conflictFile(stdout: string): string {
  const data: unknown = JSON.parse(stdout);

  if (!Array.isArray(data) || typeof data[0]?.file !== "string")
    throw new Error("No conflict file");

  return data[0].file;
}
