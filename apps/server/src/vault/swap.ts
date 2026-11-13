import { commit } from "./swaps/commit.ts";
import { type ISwap } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function commitVaultSwap(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  digest: Uint8Array,
  mailbox?: number,
) {
  return options.storage.transaction(() => commit(options, auth, swap, digest, mailbox));
}
