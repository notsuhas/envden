import { Command } from "@commander-js/extra-typings";
import { serve } from "@envden/server";

export function setupTokenFrom(env: Record<string, string | undefined>) {
  const setupToken = env.ENVDEN_SETUP_TOKEN;
  delete env.ENVDEN_SETUP_TOKEN;

  return setupToken ? { setupToken } : {};
}

export const serveCommand = new Command("serve")
  .description("Run the server; ENVDEN_SETUP_TOKEN replaces the setup token")
  .option("--restored")
  .option("--min-client <version>")
  .option("--data-dir <path>")
  .option("--port <port>", "localhost port", Number)
  .action(async (options) => {
    await serve({ ...options, ...setupTokenFrom(process.env) });
  });
