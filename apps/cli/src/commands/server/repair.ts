import { readToken } from "../../output/prompts/token.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { uploadRepair } from "../../admin/repair/upload.ts";
import { finishRepair } from "../../admin/repair/finish.ts";
import { runVaultAdmin } from "../vault/run.ts";
import { repairText } from "../../output/render/repair.ts";
import { secret, consent } from "../../output/prompts/questions.ts";

export const serverRepairCommand = new Command("repair")
  .description(
    "After a server restore, re-upload this device's data, or finish the restore with --finish",
  )
  .option(
    "--repair-token <token>",
    "Repair token; prefer stdin for upload, use a terminal for --finish",
  )
  .option("--finish", "Check every device's upload and finish the restore")
  .option("--without <device...>", "Drop unavailable devices; they rejoin as new devices")
  .option("--accept-lost", "Accept the newest verified older version of a missing file")
  .action(async (options) => {
    const token = await readToken("repair", options.repairToken);

    if (options.finish) {
      const result = await finishRepair(createAdapters(undefined, Date.now), {
        token,
        password: await secret("Master password"),
        without: options.without,
        acceptLost: options.acceptLost,
        now: Date.now,
        fetcher: fetch,
      });

      console.log(repairText(result));

      await offerReplacementKit(result);
    } else {
      await uploadRepair(createAdapters(undefined, Date.now), token, Date.now);

      console.log(
        "Uploaded this device's data. Once every device has done this, run envden server repair --finish",
      );
    }
  });

async function offerReplacementKit(result: Awaited<ReturnType<typeof finishRepair>>) {
  if (
    result.kind === "finished" &&
    result.replaceKit &&
    (await consent("Replace the recovery kit now?"))
  )
    await runVaultAdmin(createAdapters(undefined, Date.now), "replace", Date.now);
}
