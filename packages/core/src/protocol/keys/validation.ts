import { ed25519 } from "@noble/curves/ed25519.js";
import { b32, requireValue } from "../encoding/binary.ts";

export function validateEdPublic(key: Uint8Array): void {
  b32.write(key);
  const point = ed25519.Point.fromBytes(key, false);
  requireValue(!point.isSmallOrder(), "Small order public key");
}
