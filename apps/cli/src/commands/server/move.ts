import { EnvdenError } from "@envden/core/errors";
import { readToken } from "../../output/token.ts";
import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { moveServer } from "../../admin/move/run.ts";
import { secret } from "../../output/questions.ts";
import { requireServerAddress } from "../../onboarding/decisions.ts";

export const serverMoveCommand = new Command("move")
  .description("Move the vault to a new server")
  .argument("[server]", "Destination server address")
  .option(
    "--setup-token <token>",
    "Setup token, visible to other processes; use the prompt in a terminal",
  )
  .addOption(new Option("--resume", "Resume an interrupted move").conflicts("abort"))
  .option("--abort", "Abort an unfinished move")
  .action(async (server, options) => {
    const continuing = options.resume || options.abort;

    if (!server && !continuing)
      throw new EnvdenError(
        "INVALID_INPUT",
        "Give the destination server address, or --resume or --abort for an unfinished move",
      );

    await moveServer(createAdapters(undefined, Date.now), {
      address: server && requireServerAddress(server),
      token: continuing ? options.setupToken : await readToken("setup", options.setupToken),
      resume: options.resume,
      abort: options.abort,
      password: await secret("Master password"),
      now: Date.now,
      fetcher: fetch,
    });

    console.log("Move complete");
  });
