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
