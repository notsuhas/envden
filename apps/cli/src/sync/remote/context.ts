import { checkpointMaterial } from "../../vault/join/material.ts";
import { vaultConnection } from "../../vault/connection.ts";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { ISyncOptions } from "../model.ts";
import { loadState } from "../../state/store/repository.ts";

export async function syncContext(adapters: TAdapters, options: ISyncOptions) {
  const state = await loadState(adapters.home);

  if (!state?.server || !state.vaultId || !state.checkpoint || !state.files || !state.keyring)
    throw new EnvdenError("NOT_FOUND", "Run envden setup or join first");

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
    skippedRoots: new Set<string>(),
    identity,
    vaultId,
    client,
    ...(await checkpointMaterial(adapters, state)),
  };
}

export type TSyncContext = Awaited<ReturnType<typeof syncContext>>;
