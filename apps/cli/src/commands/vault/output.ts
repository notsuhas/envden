import { writeKit } from "../../vault/recovery/output.ts";
import { printKit } from "../../output/render/kit.ts";
import type { IReplacementKit } from "../../admin/recovery/credentials.ts";

export async function reportReplacementKit(kit: IReplacementKit, path?: string) {
  if (path) {
    try {
      await writeKit(path, kit);
      printKit(kit, path);

      return;
    } catch {
      console.error("envden: Could not save the recovery kit; save the kit printed below");
    }
  }

  printKit(kit);
}

export function replacementKitOutput(path?: string) {
  let shown = false;

  return {
    show: async (kit: IReplacementKit) => {
      await reportReplacementKit(kit, path);
      shown = true;
    },
    fail: (error: unknown): never => {
      if (shown)
        console.error(
          "envden: The new recovery kit is not confirmed yet. Keep the old kit too, and rerun this command to finish.",
        );

      throw error;
    },
  };
}
