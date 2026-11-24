import { encode, b16, b32, concat, requireValue, decode, equal } from "../encoding/binary.ts";
import { ctx } from "../encoding/strings.ts";
import { type IEnvelope } from "../codecs/content/envelope.ts";
import { EnvelopeCodec } from "../codecs/content/envelope.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";
import { KDF } from "../crypto/kdf.ts";
import { sealBox, openBox } from "../crypto/box.ts";

export function envelopeKey(code: Uint8Array, vaultId: Uint8Array): Uint8Array {
  return KDF(b16.write(code), b32.write(vaultId), "recovery-envelope-key");
}

export function sealEnvelope(
  value: IEnvelope,
  code: Uint8Array,
  rng: TRandom = randomBytes,
): Uint8Array {
  return sealBox(
    envelopeKey(code, value.vaultId),
    encode(EnvelopeCodec, value),
    concat(ctx("envelope"), value.vaultId),
    rng,
  );
}

export function openEnvelope(blob: Uint8Array, code: Uint8Array, vaultId: Uint8Array): IEnvelope {
  const value = decode(
    EnvelopeCodec,
    openBox(envelopeKey(code, vaultId), blob, concat(ctx("envelope"), vaultId)),
  );

  requireValue(equal(value.vaultId, vaultId), "Vault ID mismatch");

  return value;
}
