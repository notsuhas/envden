import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { moveServer } from "../../admin/move/run.ts";
import { secret } from "../../output/questions.ts";

export const serverMoveCommand = new Command("move")
  .argument("[server]")
  .option("--setup-token <token>")
  .addOption(new Option("--resume").conflicts("abort"))
  .option("--abort")
  .action(async (address, options) => {
    await moveServer(createAdapters(), {
      address,
      token: options.setupToken,
      resume: options.resume,
      abort: options.abort,
      password: await secret("Master password"),
      now: () => Date.now(),
      fetcher: fetch,
    });

    console.log("Move complete");
  });
