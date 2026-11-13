import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function requireJoinTicket(options: IAppOptions, auth: IAuth): void {
  if (
    !options.storage.session(
      auth.request.vaultId,
      { kind: "join-ticket", device: auth.request.device, purpose: "kit" },
      options.now(),
    )
  )
    throw new EnvdenError("UNAUTHORIZED", "Join ticket required");
}
