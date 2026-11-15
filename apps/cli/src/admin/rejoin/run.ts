import type { TPreferenceOptions } from "../../onboarding/preferences.ts";
import { readKit } from "../../vault/recovery/read.ts";
import type { TAdapters } from "../../adapters.ts";
import { secret } from "../../output/questions.ts";
import { defaultInput } from "../../output/default-input.ts";
import { completeJoin } from "../../onboarding/complete-join.ts";
import { pairingJoin } from "../../onboarding/join/pairing.ts";
import { kitRejoin } from "./kit.ts";

export async function runRejoin(
  adapters: TAdapters,
  address: string,
  options: TPreferenceOptions & {
    recoveryKit?: string;
    recovery?: boolean;
    name?: string;
    resume?: boolean;
  },
  now: () => number,
) {
  if (options.recoveryKit || options.recovery) {
    const name = await defaultInput(options.name, "Device name");
    const kit = await readKit(options.recoveryKit);

    await kitRejoin(adapters, {
      address,
      vaultId: kit.vaultId,
      secretKey: kit.secretKey,
      name,
      password: await secret("Master password"),
      now,
      fetcher: adapters.fetcher,
    });
  } else await pairingJoin(adapters, { ...options, address, now, rejoin: true });

  await completeJoin(adapters, now, undefined, options);
}
