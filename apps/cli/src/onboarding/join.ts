import { refuseCommittedJoin } from "../pairing/guard.ts";
import type { TPreferenceOptions } from "./preferences.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { completeJoin } from "./complete-join.ts";
import { defaultInput } from "../output/default-input.ts";
import { recoveryJoin } from "./join/recovery.ts";
import { pairingJoin } from "./join/pairing.ts";
import type { TAdapters } from "../adapters.ts";

export async function runJoin(
  adapters: TAdapters,
  address: string,
  options: TPreferenceOptions & {
    recoveryKit?: string;
    recovery?: boolean;
    name?: string;
    resume?: boolean;
  },
  now: () => number,
): Promise<void> {
  await withStateLock(adapters.home, () => refuseCommittedJoin(adapters));

  if (options.recoveryKit || options.recovery) {
    const name = await defaultInput(options.name, "Device name");
    await recoveryJoin(adapters, address, name, options.recoveryKit, now);
  } else await pairingJoin(adapters, { ...options, address, now });

  await completeJoin(adapters, now, undefined, options);
  console.log("Joined");
}
