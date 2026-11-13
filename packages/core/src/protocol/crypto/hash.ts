import { sha256 } from "@noble/hashes/sha2.js";

import { frame } from "./frame.ts";

export function H(label: string, message: Uint8Array): Uint8Array {
  return sha256(frame(label, message));
}

export { sha256 };
