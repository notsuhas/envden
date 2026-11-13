import { EnvdenError } from "@envden/core/errors";
import type { ILocalState } from "./model.ts";

export function requireConfigured(state: ILocalState | undefined, message: string) {
  if (state?.creationPending)
    throw new EnvdenError("CONFLICT", "Resume setup to finish vault creation");

  if (!state?.server || !state.vaultId) throw new EnvdenError("NOT_FOUND", message);

  return { ...state, server: state.server, vaultId: state.vaultId };
}
