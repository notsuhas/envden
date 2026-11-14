import { EnvdenError } from "@envden/core/errors";
import { loadState } from "../../state/store/repository.ts";

export async function joinLocalState(home: string, vaultId: string) {
  const state = await loadState(home);
  if (!state?.vaultId) return undefined;
  if (state.vaultId === vaultId) return state;

  if (!state.creationPending)
    throw new EnvdenError("CONFLICT", "Device is already configured for another vault");

  return undefined;
}
