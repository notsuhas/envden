import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";

import { frame } from "./frame.ts";

export function MAC(key: Uint8Array, label: string, message: Uint8Array): Uint8Array {
  return hmac(sha256, key, frame(label, message));
}
