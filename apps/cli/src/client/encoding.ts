import { EnvdenError } from "@envden/core/errors";

export function text(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function binary(value: string): Uint8Array {
  const bytes = new Uint8Array(Buffer.from(value, "base64url"));
  if (text(bytes) !== value) throw new EnvdenError("INVALID_DATA", "Invalid binary encoding");

  return bytes;
}
