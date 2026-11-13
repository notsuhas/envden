import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { createClient } from "../../client/request.ts";
import { binary } from "../../client/encoding.ts";
import { loadState } from "../../state/repository.ts";
import { deviceIdentity } from "../../identity/device.ts";

export async function adminContext(
  adapters: TAdapters,
  now: () => number,
  fetcher: TFetch = fetch,
  proof?: (request: p.IRequest) => Uint8Array,
) {
  const local = await loadState(adapters.home);

  if (!local?.server || !local.vaultId)
    throw new EnvdenError("NOT_FOUND", "Run envden setup or join first");

  const identity = await deviceIdentity(adapters.keychain, adapters.home, local.deviceName);
  const vaultId = p.unbase32(local.vaultId);

  const client = createClient({
    address: local.server.address,
    pin: binary(local.server.pin),
    vaultId,
    identity,
    now,
    fetcher,
    version: "0.0.0",
    ...(proof ? { proof } : {}),
  });

  return { adapters, local, identity, vaultId, client, now };
}

export type TAdminContext = Awaited<ReturnType<typeof adminContext>>;
