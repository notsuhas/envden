import { readToken } from "../../output/token.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { uploadRepair } from "../../admin/repair/upload.ts";
import { finishRepair } from "../../admin/repair/finish.ts";
import { runVaultAdmin } from "../vault/run.ts";
import { secret, consent } from "../../output/questions.ts";

export const serverRepairCommand = new Command("repair")
  .option(
    "--repair-token <token>",
    "Repair token; prefer stdin for upload, use a terminal for --finish",
  )
  .option("--finish")
  .option("--without <device...>")
  .option("--accept-lost")
  .action(async (options) => {
    const token = await readToken(options.repairToken, "Repair token");

    if (options.finish) {
      const result = await finishRepair(createAdapters(undefined, Date.now), {
        token,
        password: await secret("Master password"),
        without: options.without,
        acceptLost: options.acceptLost,
        now: Date.now,
        fetcher: fetch,
      });

      console.log(result);

      await offerReplacementKit(result);
    } else {
      await uploadRepair(createAdapters(undefined, Date.now), token, Date.now);

      console.log("Repair material uploaded");
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
