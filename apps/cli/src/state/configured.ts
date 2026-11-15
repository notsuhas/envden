import { EnvdenError } from "@envden/core/errors";
import type { ILocalState } from "./model.ts";

export const NOT_SET_UP = "Not set up yet. Run envden setup or envden join";

export function requireConfigured(state: ILocalState | undefined, message = NOT_SET_UP) {
  if (state?.creationPending)
    throw new EnvdenError("CONFLICT", "Setup didn't finish. Run envden setup again to finish it");

  if (!state?.server || !state.vaultId) throw new EnvdenError("NOT_FOUND", message);

  return { ...state, server: state.server, vaultId: state.vaultId };
}
