import { concat, u64 } from "../encoding/binary.ts";
import { ctx } from "../encoding/strings.ts";

export function frame(label: string, message: Uint8Array): Uint8Array {
  return concat(ctx(label), u64.write(BigInt(message.length)), message);
}
