import { readFile } from "node:fs/promises";
import type { TAdapters } from "../../adapters.ts";
import { secret, input } from "../../output/questions.ts";
import { parseKit } from "../../vault/recovery/input.ts";
import { kitJoin } from "../../vault/recovery/kit.ts";

export async function recoveryJoin(
  adapters: TAdapters,
  address: string,
  name: string,
  kitPath: string | undefined,
  now: () => number,
) {
  const kit = kitPath
    ? parseKit(JSON.parse(await readFile(kitPath, "utf8")))
    : parseKit({
        secretKey: await secret("Recovery secret key"),
        vaultId: await input("Vault ID"),
      });

  await kitJoin(adapters, {
    address,
    vaultId: kit.vaultId,
    secretKey: kit.secretKey,
    name,
    password: await secret("Master password"),
    now,
    fetcher: fetch,
  });
}
