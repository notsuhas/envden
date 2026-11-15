import { EnvdenError } from "@envden/core/errors";
import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { consent } from "../../output/prompts/questions.ts";
import { terminalJson } from "../../output/sanitize.ts";
import { fileHistory } from "../../history/list/run.ts";
import { historyText } from "../../history/list/render.ts";
import { restoreVersion } from "../../history/restore/run.ts";
import { restoreText } from "../../history/restore/render.ts";
import { parseVersion } from "../../history/restore/version.ts";

export const historyCommand = new Command("history")
  .description("List the versions the server keeps, or restore one as a local edit")
  .argument("[file]", "Env file path")
  .addOption(new Option("--all", "Include every tracked file").conflicts("restore"))
  .option(
    "--restore <version>",
    "Write that version into the checkout without pushing",
    parseVersion,
  )
  .option("--yes", "Confirm the restore")
  .option("--json", "Print the result as JSON")
  .action(async (file, options) => {
    const adapters = createAdapters(undefined, Date.now);
    const common = { cwd: process.cwd(), now: Date.now, fetcher: fetch };

    if (options.restore === undefined) {
      const result = await fileHistory(adapters, {
        ...common,
        ...(file ? { file } : {}),
        all: !!options.all,
      });

      console.log(options.json ? terminalJson(result) : historyText(result, Date.now()));

      return;
    }

    if (!file) throw new EnvdenError("INVALID_INPUT", "Name the env file to restore");

    const result = await restoreVersion(adapters, {
      ...common,
      file,
      version: options.restore,
      yes: !!options.yes,
      interactive: !!process.stdin.isTTY,
      confirm: consent,
    });

    console.log(options.json ? terminalJson(result) : restoreText(result));
  });
