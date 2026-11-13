import { requireValue } from "../encoding/binary.ts";
import { OPAQUE_LENGTHS } from "./constants.ts";

export function opaqueMessage(value: string, length: number): string {
  requireValue(/^[A-Za-z0-9_-]+$/.test(value), "Invalid OPAQUE encoding");
  const bytes = Buffer.from(value, "base64url");

  requireValue(
    bytes.length === length && bytes.toString("base64url") === value,
    "Invalid OPAQUE length or encoding",
  );

  return value;
}

export function check(value: string, key: keyof typeof OPAQUE_LENGTHS): string {
  return opaqueMessage(value, OPAQUE_LENGTHS[key]);
}
