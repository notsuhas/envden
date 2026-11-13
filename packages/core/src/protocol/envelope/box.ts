import { argon2id } from "hash-wasm";
import { encode, b16, concat, Reader, requireValue, decode, equal } from "../encoding/binary.ts";
import { normPw, ctx } from "../encoding/strings.ts";
import { type IEnvelope } from "../codecs/content/envelope.ts";
import { EnvelopeCodec } from "../codecs/content/envelope.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";
import { KDF } from "../crypto/kdf.ts";
import { sealBox, openBox } from "../crypto/box.ts";

export async function passwordKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  return argon2id({
    password: new TextEncoder().encode(normPw(password)),
    salt: b16.write(salt),
    parallelism: 4,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: "binary",
  });
}

export async function sealEnvelope(
  value: IEnvelope,
  password: string,
  secret: Uint8Array,
  rng: TRandom = randomBytes,
): Promise<Uint8Array> {
  const salt = b16.write(rng(16));

  const key = KDF(
    concat(await passwordKey(password, salt), b16.write(secret)),
    value.vaultId,
    "envelope-key",
  );

  const box = sealBox(
    key,
    encode(EnvelopeCodec, value),
    concat(ctx("envelope"), value.vaultId),
    rng,
  );

  return concat(box.slice(0, 1), salt, box.slice(1));
}

export async function openEnvelope(
  blob: Uint8Array,
  password: string,
  secret: Uint8Array,
  vaultId: Uint8Array,
): Promise<IEnvelope> {
  const r = new Reader(blob);
  requireValue(r.take(1)[0] === 1);

  const salt = r.take(16),
    key = KDF(
      concat(await passwordKey(password, salt), b16.write(secret)),
      vaultId,
      "envelope-key",
    );

  const value = decode(
    EnvelopeCodec,
    openBox(
      key,
      concat(Uint8Array.of(1), r.take(blob.length - r.offset)),
      concat(ctx("envelope"), vaultId),
    ),
  );

  requireValue(equal(value.vaultId, vaultId), "Vault ID mismatch");

  return value;
}
