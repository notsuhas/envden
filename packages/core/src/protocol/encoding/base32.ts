import { requireValue } from "./binary.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function base32(data: Uint8Array): string {
  let bits = 0,
    value = 0,
    out = "";

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }

  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];

  return out;
}

export function unbase32(text: string): Uint8Array {
  let bits = 0,
    value = 0;

  const out: number[] = [];

  for (const char of text.toUpperCase()) {
    const n = ALPHABET.indexOf(char);
    requireValue(n >= 0, "Invalid base32");
    value = (value << 5) | n;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 255);
    }
  }

  requireValue(bits < 5 && (value & ((1 << bits) - 1)) === 0, "Noncanonical base32");

  return Uint8Array.from(out);
}
