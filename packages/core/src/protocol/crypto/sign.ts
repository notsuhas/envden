import { EnvdenError } from "../../errors/index.ts";
import { ed25519 } from "@noble/curves/ed25519.js";
import { b32, b64, requireValue } from "../encoding/binary.ts";

import { validateEdPublic } from "../keys/validation.ts";
import { frame } from "./frame.ts";

export function Sign(sk: Uint8Array, label: string, message: Uint8Array): Uint8Array {
  return ed25519.sign(frame(label, message), b32.write(sk));
}

export type TVerification<T> = { ok: true; value: T } | { ok: false; reason: string };

export function Verify(
  pub: Uint8Array,
  label: string,
  message: Uint8Array,
  signature: Uint8Array,
): TVerification<true> {
  try {
    validateEdPublic(pub);

    requireValue(
      ed25519.verify(b64.write(signature), frame(label, message), pub, { zip215: false }),
      "Bad signature",
    );

    return { ok: true, value: true };
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "INVALID_DATA") throw error;

    return { ok: false, reason: "Invalid signature" };
  }
}
