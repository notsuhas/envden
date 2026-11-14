import { EnvdenError } from "@envden/core/errors";
import { clearJoiner } from "./persistence/cleanup.ts";
import { join } from "node:path";
import { optionalRead } from "../state/store/files.ts";
import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { waitMessage } from "./wait.ts";
import { resumeJoiner, resendJoiner } from "./joiner.ts";

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
  const expiresAt = stored === undefined ? now() + 86400000 : approvalDeadline(Number(stored));

  try {
    if (stored !== undefined && now() < Number(stored)) await resendJoiner(adapters, client);
    await waitMessage(client, "/v1/pairing/approver", now, expiresAt);
    await resumeJoiner(adapters, client, identity, address, pin, rejoin);
  } catch (error) {
    if (
      error instanceof EnvdenError &&
      ["UNAUTHORIZED", "INVALID_DATA", "FORK"].includes(error.code)
    )
      await clearJoiner(adapters);

    throw error;
  }
}

export function approvalDeadline(exchangeExpiry: number) {
  return exchangeExpiry + 86400000;
}
