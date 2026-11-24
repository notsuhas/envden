import type { TPreferenceOptions } from "../../onboarding/preferences.ts";
import type { TAdapters } from "../../adapters.ts";
import { askDeviceName } from "../../output/prompts/device-name.ts";
import { completeJoin } from "../../onboarding/complete-join.ts";
import { approvalJoin } from "../../onboarding/join/approval.ts";
import { joinWithRecoveryCode } from "../../onboarding/join/recovery.ts";

export async function runRejoin(
  adapters: TAdapters,
  address: string,
  options: TPreferenceOptions & { recovery?: boolean; name?: string; resume?: boolean },
  now: () => number,
) {
  if (options.recovery) {
    const name = await askDeviceName(options.name, adapters.hostname);
    await joinWithRecoveryCode(adapters, address, name, now, true);
  } else await approvalJoin(adapters, { ...options, address, now, rejoin: true });

  await completeJoin(adapters, now, undefined, options);
}
