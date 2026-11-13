import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { uploadRepair } from "../../admin/repair/upload.ts";
import { finishRepair } from "../../admin/repair/finish.ts";
import { runVaultAdmin } from "../../admin/recovery/run.ts";
import { secret, consent } from "../../output/questions.ts";

export const serverRepairCommand = new Command("repair")
  .option("--repair-token <token>")
  .option("--finish")
  .option("--without <device...>")
  .option("--accept-lost")
  .action(async (options) => {
    const token = options.repairToken ?? (await secret("Repair token"));

    if (options.finish) {
      const result = await finishRepair(createAdapters(), {
        token,
        password: await secret("Master password"),
        without: options.without,
        acceptLost: options.acceptLost,
        now: () => Date.now(),
        fetcher: fetch,
      });

      console.log(result);

      await offerReplacementKit(result);
    } else {
      await uploadRepair(createAdapters(), token, () => Date.now());
      console.log("Repair material uploaded");
    }
  });

async function offerReplacementKit(result: Awaited<ReturnType<typeof finishRepair>>) {
  if (
    result.kind === "finished" &&
    result.replaceKit &&
    (await consent("Replace the recovery kit now?"))
  )
    await runVaultAdmin(createAdapters(), "replace", () => Date.now());
}
