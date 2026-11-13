import { finishPairing } from "../../pairing/finish.ts";
import { promptPairing } from "../../pairing/prompt.ts";
import { parseKit } from "../../vault/recovery/input.ts";
import { readFile } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { input, secret } from "../../output/questions.ts";
import { firstRun } from "../../sync/first-run.ts";
import { hello } from "../../client/hello.ts";
import { createClient } from "../../client/request.ts";
import { rejoinIdentity } from "./classify.ts";
import { kitRejoin } from "./kit.ts";
import { VERSION } from "../../version.ts";

export async function runRejoin(
  adapters: TAdapters,
  address: string,
  options: { recoveryKit?: string; name?: string; resume?: boolean },
  now: () => number,
) {
  const name = options.name ?? (await input("Device name"));

  if (options.recoveryKit) {
    const kit = parseKit(JSON.parse(await readFile(options.recoveryKit, "utf8")));

    await kitRejoin(adapters, {
      address,
      vaultId: kit.vaultId,
      secretKey: kit.secretKey,
      name,
      password: await secret("Master password"),
      now,
      fetcher: fetch,
    });
  } else {
    const server = await hello(address, undefined, fetch, VERSION);
    const identity = await rejoinIdentity(adapters, name);

    const client = createClient({
      address,
      pin: server.pin,
      identity,
      vaultId: new Uint8Array(32),
      version: VERSION,
      now,
      fetcher: fetch,
    });

    if (!options.resume) {
      await promptPairing(adapters, client, identity, server.pin, now);
    }

    await finishPairing(adapters, client, identity, address, server.pin, now, true);
  }

  await firstRun(adapters, {
    now,
    fetcher: fetch,
    all: true,
    interactive: true,
    choose: async (path) => {
      const choice = await input(`Choose keep-mine, take-server or merge for ${path}`);

      if (choice !== "keep-mine" && choice !== "take-server" && choice !== "merge")
        throw new EnvdenError("INVALID_INPUT", "Invalid first-run choice");

      return choice;
    },
  });
}
