import { base32, H, SwapCodec, type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { uploadHistory } from "./upload.ts";
import { vaultChain } from "../vault/chain.ts";

export function uploadChain(options: IAppOptions, auth: IAuth, swaps: ISwap[]) {
  if (!swaps.length) throw new EnvdenError("INVALID_INPUT", "Empty history");

  return options.storage.transaction(() => {
    let result;

    for (const swap of swaps) {
      result = uploadHistory(options, auth, swap, H("swap", SwapCodec.write(swap)), false);
      if (result.kind === "head-moved") throw new EnvdenError("HEAD_MOVED", "History head moved");
    }

    if (
      options.storage.vault(auth.request.vaultId)?.restored &&
      !vaultChain(options.storage, auth.request.vaultId).state.devices.has(
        base32(auth.request.device),
      )
    )
      throw new EnvdenError("NOT_MEMBER", "Uploader not a repaired member");

    return result!;
  });
}
