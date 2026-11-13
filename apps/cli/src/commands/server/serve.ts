import { Command } from "@commander-js/extra-typings";
import { serve } from "@envden/server";

export const serveCommand = new Command("serve")
  .option("--setup-token <token>")
  .option("--restored")
  .option("--min-client <version>")
  .option("--data-dir <path>")
  .option("--port <port>", "localhost port", Number)
  .action(async (options) => {
    await serve(options);
  });
