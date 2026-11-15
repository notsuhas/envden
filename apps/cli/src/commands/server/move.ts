import { readToken } from "../../output/token.ts";
import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { moveServer } from "../../admin/move/run.ts";
import { secret } from "../../output/questions.ts";

export const serverMoveCommand = new Command("move")
  .description("Move the vault to a new server")
  .argument("[server]", "Destination server address")
  .option(
    "--setup-token <token>",
    "Setup token, visible to other processes; use the prompt in a terminal",
  )
  .addOption(new Option("--resume", "Resume an interrupted move").conflicts("abort"))
  .option("--abort", "Abort an unfinished move")
  .action(async (address, options) => {
    await moveServer(createAdapters(undefined, Date.now), {
      address,
      token:
        options.resume || options.abort
          ? options.setupToken
          : await readToken(options.setupToken, "Server setup token"),
      resume: options.resume,
      abort: options.abort,
      password: await secret("Master password"),
      now: Date.now,
      fetcher: fetch,
    });

    console.log("Move complete");
  });
