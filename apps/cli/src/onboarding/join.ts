import { clearJoiner } from "../pairing/persistence/cleanup.ts";
import { loadState } from "../state/store/repository.ts";
import type { TPreferenceOptions } from "./preferences.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { completeJoin } from "./complete-join.ts";
import { rm } from "node:fs/promises";
import { defaultInput } from "../output/default-input.ts";
import { finishPairing } from "../pairing/finish.ts";
import { promptPairing } from "../pairing/prompt.ts";
import { recoveryJoin } from "./join/recovery.ts";
import { join } from "node:path";
import type { TAdapters } from "../adapters.ts";
import { deviceIdentity } from "../identity/device.ts";
import { hello } from "../client/hello.ts";
import { createClient } from "../client/request.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { VERSION, MIN_SERVER } from "../version.ts";

async function lockedrunJoin(
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
  const name = await defaultInput(options.name, "Device name");

  if (options.recoveryKit || options.recovery) {
    await recoveryJoin(adapters, address, name, options.recoveryKit, now);

    await completeJoin(adapters, now, undefined, options);

    return;
  }

  if (!options.resume) await clearJoiner(adapters);
  const expected = options.resume ? await pairingPin(adapters.home) : undefined;

  const server = await hello(address, expected, adapters.fetcher, MIN_SERVER);

  const identity = await deviceIdentity(
    adapters.keychain,
    adapters.home,
    name,
    !options.resume && !(await loadState(adapters.home))?.checkpoint,
  );

  const client = createClient({
    address,
    pin: server.pin,
    vaultId: new Uint8Array(32),
    identity,
    now,
    fetcher: adapters.fetcher,
    version: VERSION,
  });

  if (!options.resume) {
    await atomicWrite(
      join(adapters.home, "state", "pair-pin"),
      Buffer.from(server.pin).toString("base64url"),
    );

    await promptPairing(adapters, client, identity, server.pin, now);
  }

  await finishPairing(adapters, client, identity, address, server.pin, now);
  await rm(join(adapters.home, "state", "pair-pin"), { force: true });
  await completeJoin(adapters, now, undefined, options);
  console.log("Joined");
}

export function runJoin(...args: Parameters<typeof lockedrunJoin>) {
  return withStateLock(args[0].home, () => lockedrunJoin(...args));
}

async function pairingPin(home: string) {
  const expected = await optionalRead(join(home, "state", "pair-pin"));

  return expected === undefined ? undefined : new Uint8Array(Buffer.from(expected, "base64url"));
}
