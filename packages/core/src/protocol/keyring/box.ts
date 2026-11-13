import { type IKeyring } from "../codecs/epochs/keyring.ts";
import { KeyringCodec } from "../codecs/epochs/keyring.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";
import { sealBox, openBox } from "../crypto/box.ts";
import { KDF } from "../crypto/kdf.ts";
import { b32, u32, encode, concat, decode, requireValue, equal } from "../encoding/binary.ts";
import { ctx } from "../encoding/strings.ts";
import { keyCommit } from "../epochs/wrap.ts";

export function sealKeyring(
  value: IKeyring,
  key: Uint8Array,
  rng: TRandom = randomBytes,
): Uint8Array {
  return sealBox(
    KDF(b32.write(key), value.vaultId, "keyring-key", u32.write(value.epoch)),
    encode(KeyringCodec, value),
    concat(ctx("keyring"), value.vaultId, u32.write(value.epoch)),
    rng,
  );
}

export function openKeyring(
  box: Uint8Array,
  key: Uint8Array,
  vaultId: Uint8Array,
  epoch: number,
  commits: ReadonlyMap<number, Uint8Array>,
  knownIdKey?: Uint8Array,
): IKeyring {
  const value = decode(
    KeyringCodec,
    openBox(
      KDF(b32.write(key), b32.write(vaultId), "keyring-key", u32.write(epoch)),
      box,
      concat(ctx("keyring"), vaultId, u32.write(epoch)),
    ),
  );

  requireValue(equal(value.vaultId, vaultId) && value.epoch === epoch);
  if (knownIdKey) requireValue(equal(value.idKey, knownIdKey), "ID key changed");

  for (const item of [...value.older, { epoch, key }]) {
    const expected = commits.get(item.epoch);

    requireValue(
      expected !== undefined && equal(expected, keyCommit(item.key, vaultId, item.epoch)),
      "Epoch commit mismatch",
    );
  }

  return value;
}
