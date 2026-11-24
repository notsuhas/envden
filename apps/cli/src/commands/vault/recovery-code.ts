import type { TAdapters } from "../../adapters.ts";
import { replaceCode } from "../../admin/recovery/replace.ts";
import { recoveryCodeOutput, requireCodeOutput } from "../../vault/recovery/show.ts";

export async function replaceRecoveryCode(adapters: TAdapters, now: () => number, path?: string) {
  const target = { path };
  requireCodeOutput(target);
  const output = recoveryCodeOutput(target);
  const result = await replaceCode(adapters, now, output.show).catch(output.fail);

  console.log(
    result.kind === "finished"
      ? "Finished an interrupted replacement; the code it showed is now the one that works. Run again for another code."
      : "Recovery code replaced; the old one no longer works",
  );
}
