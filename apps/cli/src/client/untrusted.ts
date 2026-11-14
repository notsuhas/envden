import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

export function decodeUntrusted<T>(codec: p.ICodec<T>, bytes: Uint8Array): T {
  try {
    return p.decode(codec, bytes);
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid data from server", { cause });
  }
}
