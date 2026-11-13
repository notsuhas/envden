import { EnvdenError } from "@envden/core/errors";
import { equal } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function requireMailboxGrant(options: IAppOptions, auth: IAuth, number: number): void {
  const box = options.storage.mailbox(auth.request.vaultId, number, options.now());

  if (!auth.member || !box || !equal(box.device, auth.request.device) || !box.slots.PairJoiner)
    throw new EnvdenError("UNAUTHORIZED", "Mailbox grant required");
}
