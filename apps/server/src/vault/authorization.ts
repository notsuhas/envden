import { authorizeOperation } from "./authorization/operation.ts";
import { requireStagedRecord } from "../auth/staged.ts";
import type { TAuthorization } from "@envden/core/chain";
import { type ISwap } from "@envden/core/protocol";
import type { IStoredSwap } from "@envden/core/adapters";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function authorizeSwap(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  required: TAuthorization,
  stored: IStoredSwap,
  mailbox?: number,
) {
  const { vaultId, device } = auth.request;

  authorizeOperation(options, auth, swap, required, stored, mailbox);

  if (swap.opaqueRecord) {
    const key = requireStagedRecord(options, vaultId, device, swap.opaqueRecord);

    stored.consumeSessions = [...(stored.consumeSessions ?? []), key];
  }
}

export { requireRepair } from "./authorization/repair.ts";
