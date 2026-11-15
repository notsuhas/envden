import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { IKeychainAdapter } from "@envden/core/adapters";
import type { TAdapters } from "../../adapters.ts";
import { hello } from "../../client/hello.ts";
import { createClient } from "../../client/request.ts";
import { deviceIdentity, type TDeviceIdentity } from "../../identity/device.ts";
import { readIdentity } from "../../identity/stored.ts";
import { defaultInput } from "../../output/default-input.ts";
import { finishPairing } from "../../pairing/finish.ts";
import { clearJoiner } from "../../pairing/persistence/cleanup.ts";
import { promptPairing } from "../../pairing/prompt.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import { VERSION, MIN_SERVER } from "../../version.ts";

interface IPairingJoin {
  address: string;
  name?: string;
  resume?: boolean;
  rejoin?: boolean;
  now: () => number;
}

export async function pairingJoin(adapters: TAdapters, options: IPairingJoin) {
  const { address, rejoin = false, now } = options;
  const namespace = rejoin ? `${adapters.home}/rejoin` : adapters.home;

  if (options.resume) {
    await requireExchange(adapters);

    const expected = await pairingPin(adapters.home);
    const server = await hello(address, expected, adapters.fetcher, MIN_SERVER);
    const identity = await storedIdentity(adapters.keychain, namespace);
    const client = joinerClient(adapters, address, server.pin, identity, now);

    await finishPairing(adapters, client, identity, address, server.pin, now, rejoin);

    return;
  }

  const name = await defaultInput(options.name, "Device name");
  await withStateLock(adapters.home, () => clearJoiner(adapters));
  const server = await hello(address, undefined, adapters.fetcher, MIN_SERVER);
  const fresh = !(await loadState(adapters.home))?.checkpoint;
  const identity = await deviceIdentity(adapters.keychain, namespace, name, fresh);
  const client = joinerClient(adapters, address, server.pin, identity, now);

  await withStateLock(adapters.home, () =>
    atomicWrite(
      join(adapters.home, "state", "pair-pin"),
      Buffer.from(server.pin).toString("base64url"),
      adapters.now,
    ),
  );

  await promptPairing(adapters, client, identity, server.pin, now);
  await finishPairing(adapters, client, identity, address, server.pin, now, rejoin);
}

function joinerClient(
  adapters: TAdapters,
  address: string,
  pin: Uint8Array,
  identity: TDeviceIdentity,
  now: () => number,
) {
  return createClient({
    address,
    pin,
    vaultId: new Uint8Array(32),
    identity,
    now,
    fetcher: adapters.fetcher,
    version: VERSION,
  });
}

async function requireExchange(adapters: TAdapters) {
  const key = await adapters.keychain.get(`envden/${adapters.home}/pair-receive`);
  key?.fill(0);

  if (!key) throw new EnvdenError("NOT_FOUND", "No pairing exchange to resume");
}

async function storedIdentity(keychain: IKeychainAdapter, namespace: string) {
  const stored = await keychain.get(`envden/${namespace}/device`);
  if (!stored) throw new EnvdenError("NOT_FOUND", "No pairing exchange to resume");

  return readIdentity(stored);
}

async function pairingPin(home: string) {
  const expected = await optionalRead(join(home, "state", "pair-pin"));

  return expected === undefined ? undefined : new Uint8Array(Buffer.from(expected, "base64url"));
}
