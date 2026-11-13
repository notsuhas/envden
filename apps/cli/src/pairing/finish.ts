import { join } from "node:path";
import { optionalRead } from "../state/files.ts";
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
  const stored = await optionalRead(join(adapters.home, "state", "pair-expiry"));
  const expiresAt = stored === undefined ? now() + 600000 : Number(stored);
  await waitMessage(client, "/v1/pairing/approver", now, expiresAt);
  await resumeJoiner(adapters, client, identity, address, pin, rejoin);
}
