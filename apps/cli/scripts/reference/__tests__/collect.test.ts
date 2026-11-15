import { expect, test } from "bun:test";
import { Argument, Command, Option } from "@commander-js/extra-typings";
import { collectCommands } from "../collect.ts";

test("collects visible commands depth first in name order", () => {
  const program = new Command("envden")
    .addCommand(new Command("zeta").description("Last"))
    .addCommand(new Command("secret"), { hidden: true })
    .addCommand(
      new Command("alpha")
        .addCommand(new Command("rm").addArgument(new Argument("<ids...>", "Targets")))
        .addCommand(
          new Command("add")
            .addArgument(new Argument("[path]", "Root").default("/home/me", "current directory"))
            .addOption(new Option("--mode <mode>", "Mode").choices(["a", "b"]))
            .addOption(new Option("--debug").hideHelp()),
        ),
    );

  expect(collectCommands(program)).toEqual([
    {
      path: "envden alpha",
      usage: "envden alpha [options] [command]",
      description: "",
      subcommands: ["add", "rm"],
      arguments: [],
      options: [],
    },
    {
      path: "envden alpha add",
      usage: "envden alpha add [options] [path]",
      description: "",
      subcommands: [],
      arguments: [{ term: "[path]", description: "Root", default: "current directory" }],
      options: [{ term: "--mode <mode>", description: "Mode (a, b)" }],
    },
    {
      path: "envden alpha rm",
      usage: "envden alpha rm [options] <ids...>",
      description: "",
      subcommands: [],
      arguments: [{ term: "<ids...>", description: "Targets" }],
      options: [],
    },
    {
      path: "envden zeta",
      usage: "envden zeta [options]",
      description: "Last",
      subcommands: [],
      arguments: [],
      options: [],
    },
  ]);
});
