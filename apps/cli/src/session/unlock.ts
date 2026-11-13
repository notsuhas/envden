import { requireConfigured } from "../state/configured.ts";
import type { TFetch } from "../client/fetch.ts";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../adapters.ts";
import { loadState, saveState } from "../state/repository.ts";
import { deviceIdentity } from "../identity/device.ts";
import { createClient } from "../client/request.ts";
import { binary } from "../client/encoding.ts";
import { login } from "./login.ts";
import { VERSION } from "../version.ts";

export async function unlockDevice(
  adapters: TAdapters,
  password: string,
  now: () => number,
  fetcher: TFetch,
) {
  const state = requireConfigured(await loadState(adapters.home), "Run envden setup or join first");

  const identity = await deviceIdentity(adapters.keychain, adapters.home, state.deviceName);

  const client = createClient({
    address: state.server.address,
    pin: binary(state.server.pin),
    vaultId: p.unbase32(state.vaultId),
    identity,
    version: VERSION,
    now,
    fetcher,
  });

  const session = await login(client, p.unbase32(state.vaultId), password);
  if (session) state.session = session;
  await saveState(adapters.home, state);
}
