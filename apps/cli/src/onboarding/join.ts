import { refuseCommittedJoin } from "../pairing/guard.ts";
import type { TPreferenceOptions } from "./preferences.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { completeJoin } from "./complete-join.ts";
import { askDeviceName } from "../output/prompts/device-name.ts";
import { recoveryJoin } from "./join/recovery.ts";
import { pairingJoin } from "./join/pairing.ts";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { loadState } from "../state/store/repository.ts";
import { requireConfigured } from "../state/configured.ts";

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
): Promise<ILocalState> {
  await withStateLock(adapters.home, () => refuseCommittedJoin(adapters));

  if (options.recoveryKit || options.recovery) {
    const name = await askDeviceName(options.name, adapters.hostname);
    await recoveryJoin(adapters, address, name, options.recoveryKit, now);
  } else await pairingJoin(adapters, { ...options, address, now });

  await completeJoin(adapters, now, undefined, options);

  return requireConfigured(await loadState(adapters.home));
}
