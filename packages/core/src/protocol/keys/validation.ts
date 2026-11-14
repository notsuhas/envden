import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { EnvdenError } from "../../errors/index.ts";
import { b32, requireValue } from "../encoding/binary.ts";

export function validateEdPublic(key: Uint8Array): void {
  b32.write(key);
  let point;

  try {
    point = ed25519.Point.fromBytes(key, false);
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid public key", { cause });
  }

  requireValue(!point.isSmallOrder(), "Small order public key");
}

export function validateEncPublic(key: Uint8Array): void {
  b32.write(key);

  try {
    x25519.getSharedSecret(new Uint8Array(32), key);
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid encryption public key", { cause });
  }
}
