import { sha256 } from "@noble/hashes/sha2.js";

import { hkdf } from "@noble/hashes/hkdf.js";

import { concat, EMPTY } from "../encoding/binary.ts";
import { ctx } from "../encoding/strings.ts";

export function KDF(
  ikm: Uint8Array,
  salt: Uint8Array,
  label: string,
  extra: Uint8Array = EMPTY,
): Uint8Array {
  return hkdf(sha256, ikm, salt, concat(ctx(label), extra), 32);
}
