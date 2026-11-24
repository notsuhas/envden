import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { exportBackup } from "../../backup/run.ts";
import { secret } from "../../output/prompts/questions.ts";
import { exportText } from "../../output/render/backup.ts";

export const exportCommand = new Command("export")
  .description(
    "Write the env files on this device to one age-encrypted file that age or rage can open without envden",
  )
  .requiredOption("--out <file>", "Where to write the backup")
  .option(
    "--recipient <key>",
    "age public key (age1… or age1pq1…) that can open it; repeat for more",
    (value: string, previous: string[]) => [...previous, value],
    [] as string[],
  )
  .option("--passphrase", "Encrypt with a passphrase you type twice instead of a key")
  .action(async (options) => {
    const adapters = createAdapters(undefined, Date.now);
    const passphrase = options.passphrase ?? false;

    const result = await exportBackup(adapters, {
      out: options.out,
      cwd: process.cwd(),
      recipients: options.recipient,
      passphrase,
      secret,
    });

    console.log(exportText({ ...result, passphrase }, adapters.userHome));
  });
