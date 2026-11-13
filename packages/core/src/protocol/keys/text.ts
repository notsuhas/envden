import { base32, unbase32 } from "../encoding/base32.ts";
import { concat, b16, requireValue, equal } from "../encoding/binary.ts";
import { H } from "../crypto/hash.ts";

export function encodeSecretKey(secret: Uint8Array): string {
  const text = base32(concat(b16.write(secret), H("sk-check", secret).slice(0, 2)));

  return "EK1-" + (text.match(/.{1,5}/g) ?? []).join("-");
}

export function decodeSecretKey(text: string): Uint8Array {
  requireValue(text.toUpperCase().startsWith("EK1-"), "Invalid secret key prefix");
  const bytes = unbase32(text.slice(4).replaceAll("-", ""));
  requireValue(bytes.length === 18, "Invalid secret key length");
  const secret = bytes.slice(0, 16);
  requireValue(equal(bytes.slice(16), H("sk-check", secret).slice(0, 2)), "Secret key checksum");

  return secret;
}
