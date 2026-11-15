import { milliseconds } from "date-fns";
import { join } from "node:path";
import { atomicWrite } from "../state/store/files.ts";
import { withStateLock } from "../state/lock/lock.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { input } from "../output/questions.ts";
import { waitMessage } from "./wait.ts";
import { exchangeJoiner } from "./joiner.ts";

export async function promptPairing(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  pin: Uint8Array,
  now: () => number,
  interaction = { input, waitMessage },
) {
  const code = await interaction.input("Pairing code", true, undefined, codeProblem);

  const mailbox = p.normalizePairingCode(code).mailbox;

  await exchangeJoiner(adapters, client, identity, pin, code, async (serverExpiry) => {
    const expiresAt = Math.min(serverExpiry, now() + milliseconds({ minutes: 10 }));

    await withStateLock(adapters.home, () =>
      atomicWrite(join(adapters.home, "state", "pair-expiry"), String(expiresAt), adapters.now),
    );

    await interaction.waitMessage(client, `/v1/pairing/mailboxes/${mailbox}/KE2`, now, expiresAt);
  });

  console.log("Waiting for the approving device");
}

function codeProblem(value: string) {
  try {
    p.normalizePairingCode(value);

    return undefined;
  } catch (error) {
    if (!(error instanceof EnvdenError)) throw error;

    return error.message;
  }
}
