import { writeKit } from "../../vault/recovery/output.ts";
import { printKit, printKitSaved } from "../../output/render/devices/kit.ts";
import { reportKit } from "../../vault/recovery/pdf/report.ts";
import { loadState } from "../../state/store/repository.ts";
import type { IReplacementKit } from "../../admin/recovery/credentials.ts";
import type { TAdapters } from "../../adapters.ts";

type TKitAdapters = Pick<TAdapters, "home" | "userHome" | "hostname" | "now">;

export async function reportReplacementKit(
  adapters: TKitAdapters,
  kit: IReplacementKit,
  path?: string,
) {
  if (!path) {
    const deviceName = (await loadState(adapters.home))?.deviceName ?? adapters.hostname;

    return reportKit(kit, { userHome: adapters.userHome, deviceName, now: adapters.now() });
  }

  try {
    await writeKit(path, kit);
    printKitSaved(path, "json");
  } catch {
    console.error("envden: Could not save the recovery kit; save the kit printed below");
    printKit(kit);
  }
}

export function replacementKitOutput(adapters: TKitAdapters, path?: string) {
  let shown = false;

  return {
    show: async (kit: IReplacementKit) => {
      await reportReplacementKit(adapters, kit, path);
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
