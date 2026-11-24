import { EnvdenError } from "../../errors/index.ts";
import { base32, unbase32 } from "../encoding/base32.ts";
import { b16, concat, equal } from "../encoding/binary.ts";
import { H } from "../crypto/hash.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";

const PREFIX = "ER1";

const TYPO = "That recovery code has a typo. Check it against the one you stored";

export function generateRecoveryCode(rng: TRandom = randomBytes): Uint8Array {
  return b16.write(rng(16));
}

export function encodeRecoveryCode(code: Uint8Array): string {
  const text = base32(concat(b16.write(code), checksum(code)));

  return [PREFIX, ...(text.match(/.{1,5}/g) ?? [])].join("-");
}

export function decodeRecoveryCode(input: string): Uint8Array {
  // ASCII first: toUpperCase folds letters such as ſ into base32 characters.
  if (!/^[0-9A-Za-z\s-]*$/.test(input)) throw new EnvdenError("INVALID_INPUT", TYPO);

  const text = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

  if (!text.startsWith(PREFIX))
    throw new EnvdenError("INVALID_INPUT", "Recovery codes start with ER1-");

  const bytes = codeBytes(text.slice(PREFIX.length));
  const code = bytes.slice(0, 16);

  if (!equal(bytes.slice(16), checksum(code))) throw new EnvdenError("INVALID_INPUT", TYPO);

  return code;
}

function codeBytes(text: string): Uint8Array {
  let bytes: Uint8Array;

  try {
    bytes = unbase32(text);
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", TYPO, { cause });
  }

  if (bytes.length !== 18) throw new EnvdenError("INVALID_INPUT", TYPO);

  return bytes;
}

function checksum(code: Uint8Array): Uint8Array {
  return H("recovery-code-check", code).slice(0, 2);
}
