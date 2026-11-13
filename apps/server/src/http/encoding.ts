import { EnvdenError } from "@envden/core/errors";

export function text(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function binary(value: string | undefined, length?: number): Uint8Array {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new EnvdenError("INVALID_INPUT", "Invalid encoding");

  const bytes = Buffer.from(value, "base64url");

  if (text(bytes) !== value || (length !== undefined && bytes.length !== length))
    throw new EnvdenError("INVALID_INPUT", "Invalid encoding");

  return bytes;
}

export function input<T>(parse: () => T): T {
  try {
    return parse();
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "Invalid input", { cause });
  }
}
