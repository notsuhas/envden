import { authorizeOperation } from "./authorization/operation.ts";
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
  request?: number,
) {
  authorizeOperation(options, auth, swap, required, stored, request);
}

export { requireRepair } from "./authorization/repair.ts";
