import type { TPreferenceOptions } from "../../onboarding/preferences.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { finishPairing } from "../../pairing/finish.ts";
import { promptPairing } from "../../pairing/prompt.ts";
import { readKit } from "../../vault/recovery/read.ts";
import type { TAdapters } from "../../adapters.ts";
import { input, secret } from "../../output/questions.ts";
import { completeJoin } from "../../onboarding/complete-join.ts";
import { hello } from "../../client/hello.ts";
import { createClient } from "../../client/request.ts";
import { rejoinIdentity } from "./classify.ts";
import { kitRejoin } from "./kit.ts";
import { VERSION, MIN_SERVER } from "../../version.ts";

async function lockedrunRejoin(
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
  const name = options.name ?? (await input("Device name"));

  if (options.recoveryKit || options.recovery) {
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
  } else {
    const server = await hello(address, undefined, adapters.fetcher, MIN_SERVER);
    const identity = await rejoinIdentity(adapters, name);

    const client = createClient({
      address,
      pin: server.pin,
      identity,
      vaultId: new Uint8Array(32),
      version: VERSION,
      now,
      fetcher: adapters.fetcher,
    });

    if (!options.resume) {
      await promptPairing(adapters, client, identity, server.pin, now);
    }

    await finishPairing(adapters, client, identity, address, server.pin, now, true);
  }

  await completeJoin(adapters, now, undefined, options);
}

export function runRejoin(...args: Parameters<typeof lockedrunRejoin>) {
  return withStateLock(args[0].home, () => lockedrunRejoin(...args));
}
