import { requireValue } from "../encoding/binary.ts";

export function shareText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

// Strict: only the unpadded base64url text shareText itself produces is accepted.
export function readShareText(text: string, length: number): Uint8Array {
  const bytes = Buffer.from(text, "base64url");

  requireValue(
    bytes.length === length && bytes.toString("base64url") === text,
    "Invalid share link",
  );

  return new Uint8Array(bytes);
}
