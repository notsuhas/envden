import { gcm } from "@noble/ciphers/aes.js";
import { EnvdenError } from "../../errors/index.ts";
import { concat, b16, b32, requireValue, Reader } from "../encoding/binary.ts";
import { ctx } from "../encoding/strings.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";

const VERSION = 1;

const NONCE_BYTES = 12;

export interface IShareSecrets {
  id: Uint8Array;
  key: Uint8Array;
}

export function newShare(rng: TRandom = randomBytes): IShareSecrets {
  return { id: b16.write(rng(16)), key: b32.write(rng(32)) };
}

function shareAD(id: Uint8Array): Uint8Array {
  return concat(ctx("share"), Uint8Array.of(VERSION), b16.write(id));
}

export function sealShare(
  share: IShareSecrets,
  plaintext: Uint8Array,
  rng: TRandom = randomBytes,
): Uint8Array {
  const nonce = rng(NONCE_BYTES);
  requireValue(nonce.length === NONCE_BYTES);

  const cipher = gcm(b32.write(share.key), nonce, shareAD(share.id));

  return concat(Uint8Array.of(VERSION), nonce, cipher.encrypt(plaintext));
}

export function openShare(share: IShareSecrets, box: Uint8Array): Uint8Array {
  const r = new Reader(box);
  requireValue(r.take(1)[0] === VERSION, "Unknown share version");

  const nonce = r.take(NONCE_BYTES);
  const cipher = gcm(b32.write(share.key), nonce, shareAD(share.id));

  try {
    return cipher.decrypt(r.take(box.length - r.offset));
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Unable to decrypt share", { cause });
  }
}
