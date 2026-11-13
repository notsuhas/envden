import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { waitMessage } from "./wait.ts";
import { resumeJoiner } from "./joiner.ts";

export async function finishPairing(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  pin: Uint8Array,
  now: () => number,
  rejoin = false,
) {
  await waitMessage(client, "/v1/pairing/approver", now, now() + 300000);
  await resumeJoiner(adapters, client, identity, address, pin, rejoin);
}
