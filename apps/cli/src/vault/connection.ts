import * as p from "@envden/core/protocol";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import type { TFetch } from "../client/fetch.ts";
import { deviceIdentity } from "../identity/device.ts";
import { createClient } from "../client/request.ts";
import { binary } from "../client/encoding.ts";
import { VERSION } from "../version.ts";

export async function vaultConnection(
  adapters: TAdapters,
  state: ILocalState & { server: NonNullable<ILocalState["server"]>; vaultId: string },
  now: () => number,
  fetcher: TFetch,
) {
  const identity = await deviceIdentity(adapters.keychain, adapters.home, state.deviceName);
  const vaultId = p.unbase32(state.vaultId);

  const client = createClient({
    address: state.server.address,
    pin: binary(state.server.pin),
    vaultId,
    identity,
    version: VERSION,
    now,
    fetcher,
  });

  return { identity, vaultId, client };
}
