import type { TAdapters } from "../../adapters.ts";
import { askRecoveryCode } from "../../output/prompts/recovery-code.ts";
import { recoveryJoin } from "../../vault/recovery/join.ts";

export async function joinWithRecoveryCode(
  adapters: TAdapters,
  address: string,
  name: string,
  now: () => number,
  rejoin = false,
  askCode = askRecoveryCode,
) {
  await recoveryJoin(adapters, {
    address,
    code: await askCode(),
    name,
    now,
    fetcher: adapters.fetcher,
    ...(rejoin ? { rejoin } : {}),
  });
}
