import { checkpointMaterial } from "../../vault/join/material.ts";
import { vaultConnection } from "../../vault/connection.ts";
import { readConfig } from "../../settings/config.ts";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { ISyncOptions } from "../model.ts";
import { loadState } from "../../state/store/repository.ts";
import { VERSION } from "../../version.ts";

export async function syncContext(adapters: TAdapters, options: ISyncOptions) {
  const state = await loadState(adapters.home);

  if (!state?.server || !state.vaultId || !state.checkpoint || !state.files || !state.keyring)
    throw new EnvdenError("NOT_FOUND", "Run envden setup or join first");

  const config = await readConfig(adapters.home);

  if (state.release?.unsafe.includes(VERSION) && config["allow-version"] !== VERSION)
    throw new EnvdenError("UNSAFE_VERSION", "Update envden before syncing");

  const { identity, vaultId, client } = await vaultConnection(
    adapters,
    { ...state, server: state.server, vaultId: state.vaultId },
    options.now,
    options.fetcher,
  );

  return {
    adapters,
    options,
    state,
    identity,
    vaultId,
    client,
    ...(await checkpointMaterial(adapters, state)),
  };
}

export type TSyncContext = Awaited<ReturnType<typeof syncContext>>;
