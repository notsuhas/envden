import { EnvdenError } from "../../errors/index.ts";
import { base32 } from "../../protocol/encoding/base32.ts";

export function check(value: unknown): asserts value {
  if (!value) throw new EnvdenError("INVALID_DATA", "Invalid chain data");
}

export function id(bytes: Uint8Array): string {
  return base32(bytes);
}
