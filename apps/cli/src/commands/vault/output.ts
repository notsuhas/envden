import { writeKit } from "../../vault/recovery/output.ts";
import { terminalJson } from "../../output/sanitize.ts";

export async function reportReplacementKit(kit: unknown, path?: string) {
  if (path) {
    try {
      await writeKit(path, kit);

      return;
    } catch {
      console.error("envden: Could not save the recovery kit; save the kit printed below");
    }
  }

  console.log(terminalJson(kit));
}

export function replacementKitOutput(path?: string) {
  let shown = false;

  return {
    show: async (kit: unknown) => {
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
