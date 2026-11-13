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
) {
  const code = await secret("Pairing code");
  const mailbox = p.normalizePairingCode(code).mailbox;
  const expiresAt = now() + 300000;

  await exchangeJoiner(adapters, client, identity, pin, code, async () => {
    await waitMessage(client, `/v1/pairing/mailboxes/${mailbox}/KE2`, now, expiresAt);
  });

  console.log("Waiting for the approving device");
}
