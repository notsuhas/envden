import { EnvdenError } from "@envden/core/errors";
import type { IKeychainAdapter } from "@envden/core/adapters";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import { hello } from "../../client/hello.ts";
import { createClient } from "../../client/request.ts";
import { deviceIdentity, type TDeviceIdentity } from "../../identity/device.ts";
import { readIdentity } from "../../identity/stored.ts";
import { askDeviceName } from "../../output/prompts/device-name.ts";
import { consent } from "../../output/prompts/questions.ts";
import { sanitizeConsole } from "../../output/sanitize.ts";
import { finishJoin, requestJoin, type IJoinerInteraction } from "../../approval/joiner.ts";
import { clearJoiner } from "../../approval/persistence/cleanup.ts";
import { readJoiner } from "../../approval/persistence/joiner.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { loadState } from "../../state/store/repository.ts";
import { VERSION, MIN_SERVER } from "../../version.ts";

interface IApprovalJoin {
  address: string;
  name?: string;
  resume?: boolean;
  rejoin?: boolean;
  now: () => number;
}

const terminal: IJoinerInteraction = {
  confirm: (message) => consent(message),
  report: (message) => console.log(sanitizeConsole(message)),
};

export async function approvalJoin(
  adapters: TAdapters,
  options: IApprovalJoin,
  interaction: IJoinerInteraction = terminal,
) {
  const { address, rejoin = false, now } = options;
  const namespace = rejoin ? `${adapters.home}/rejoin` : adapters.home;

  if (options.resume) {
    const joiner = await readJoiner(adapters);
    const server = await hello(address, p.unbase32(joiner.pin), adapters.fetcher, MIN_SERVER);
    const identity = await storedIdentity(adapters.keychain, namespace);

    const client = joinerClient(
      adapters,
      address,
      server.pin,
      identity,
      now,
      p.unbase32(joiner.vaultId),
    );

    await finishJoin(adapters, client, identity, address, joiner, { now, rejoin });

    return;
  }

  const name = await askDeviceName(options.name, adapters.hostname);
  await withStateLock(adapters.home, () => clearJoiner(adapters));
  const server = await hello(address, undefined, adapters.fetcher, MIN_SERVER);
  const fresh = !(await loadState(adapters.home))?.checkpoint;
  const identity = await deviceIdentity(adapters.keychain, namespace, name, fresh);
  const client = joinerClient(adapters, address, server.pin, identity, now, new Uint8Array(32));
  const joiner = await requestJoin(adapters, client, identity, server.pin, now, interaction);
  const member = client.forVault(p.unbase32(joiner.vaultId));

  interaction.report("Waiting for the approving device");

  await finishJoin(adapters, member, identity, address, joiner, {
    now,
    rejoin,
    ...(interaction.pause ? { pause: interaction.pause } : {}),
  });
}

function joinerClient(
  adapters: TAdapters,
  address: string,
  pin: Uint8Array,
  identity: TDeviceIdentity,
  now: () => number,
  vaultId: Uint8Array,
) {
  return createClient({
    address,
    pin,
    vaultId,
    identity,
    now,
    fetcher: adapters.fetcher,
    version: VERSION,
  });
}

async function storedIdentity(keychain: IKeychainAdapter, namespace: string) {
  const stored = await keychain.get(`envden/${namespace}/device`);
  if (!stored) throw new EnvdenError("NOT_FOUND", "No join to resume");

  return readIdentity(stored);
}
