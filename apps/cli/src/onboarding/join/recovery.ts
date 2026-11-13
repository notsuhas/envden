import type { TAdapters } from "../../adapters.ts";
import { secret } from "../../output/questions.ts";
import { readKit } from "../../vault/recovery/read.ts";
import { kitJoin } from "../../vault/recovery/kit.ts";

export async function recoveryJoin(
  adapters: TAdapters,
  address: string,
  name: string,
  kitPath: string | undefined,
  now: () => number,
  askSecret = secret,
) {
  const kit = await readKit(kitPath);

  await kitJoin(adapters, {
    address,
    vaultId: kit.vaultId,
    secretKey: kit.secretKey,
    name,
    password: await askSecret("Master password"),
    now,
    fetcher: adapters.fetcher,
  });
}
