import { join } from "node:path";
import { atomicWrite } from "../state/store/files.ts";
import { withStateLock } from "../state/lock/lock.ts";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { secret } from "../output/questions.ts";
import { waitMessage } from "./wait.ts";
import { exchangeJoiner } from "./joiner.ts";

export async function promptPairing(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  pin: Uint8Array,
  now: () => number,
  interaction = { secret, waitMessage },
) {
  const code = await interaction.secret("Pairing code");
  const mailbox = p.normalizePairingCode(code).mailbox;

  await exchangeJoiner(adapters, client, identity, pin, code, async (serverExpiry) => {
    const expiresAt = Math.min(serverExpiry, now() + 600000);

    await withStateLock(adapters.home, () =>
      atomicWrite(join(adapters.home, "state", "pair-expiry"), String(expiresAt)),
    );

    await interaction.waitMessage(client, `/v1/pairing/mailboxes/${mailbox}/KE2`, now, expiresAt);
  });

  console.log("Waiting for the approving device");
}
