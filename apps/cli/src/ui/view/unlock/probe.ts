import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../../adapters.ts";
import { getUnlockPeriod } from "../../../settings/unlock-period.ts";
import type { TUnlockProbe } from "./state.ts";

export async function probeUnlock(adapters: TAdapters, now: () => number): Promise<TUnlockProbe> {
  try {
    return { kind: "unlocked", period: (await getUnlockPeriod(adapters, now)).period };
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "LOCKED") return { kind: "locked" };

    return { kind: "unreachable" };
  }
}
