import type { TAdapters } from "../../adapters.ts";
import type { TClient } from "../../client/request.ts";
import type { TDeviceIdentity } from "../../identity/device.ts";
import type { ILocalState } from "../../state/model.ts";
import type { THistory } from "../history.ts";
import { checkpointMaterial } from "./material.ts";
import { acceptHead } from "../../sync/remote/accept.ts";
import { persistCheckpoint } from "../../sync/remote/persist.ts";

export async function advanceCheckpoint(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  state: ILocalState,
  history: THistory,
) {
  const material = await checkpointMaterial(adapters, state);

  const context = {
    adapters,
    client,
    identity,
    state,
    skippedRoots: new Set<string>(),
    ...material,
    vaultId: material.checkpoint.header.body.vaultId,
    options: { now: () => 0, fetcher: adapters.fetcher },
  };

  await acceptHead(context, history);
  await persistCheckpoint(context);

  return state;
}
