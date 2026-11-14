import { EnvdenError } from "../../errors/index.ts";
import { x25519 } from "@noble/curves/ed25519.js";
import { CipherSuite, HkdfSha256 } from "@hpke/core";
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519";
import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import { MAC } from "../crypto/mac.ts";
import { b32, concat, u32, b16, EMPTY, requireValue, equal } from "../encoding/binary.ts";
import { ctx } from "../encoding/strings.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";
import { type IWrap } from "../codecs/epochs/wrap.ts";

export function keyCommit(key: Uint8Array, vaultId: Uint8Array, epoch: number): Uint8Array {
  return MAC(b32.write(key), "epoch-commit", concat(b32.write(vaultId), u32.write(epoch)));
}

const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
});

function wrapInfo(
  vaultId: Uint8Array,
  epoch: number,
  recipient: Uint8Array,
  encPub: Uint8Array,
): Uint8Array {
  return concat(
    ctx("wrap"),
    b32.write(vaultId),
    u32.write(epoch),
    b16.write(recipient),
    b32.write(encPub),
  );
}

export async function sealWrap(
  key: Uint8Array,
  vaultId: Uint8Array,
  epoch: number,
  recipient: Uint8Array,
  encPub: Uint8Array,
  rng: TRandom = randomBytes,
): Promise<IWrap> {
  const recipientPublicKey = await suite.kem.importKey("raw", encPub, true);
  const seed = b32.write(rng(32));
  const ephemeral = await suite.kem.importKey("raw", seed, false);
  const publicKey = await suite.kem.importKey("raw", x25519.getPublicKey(seed), true);

  const result = await suite.seal(
    {
      recipientPublicKey,
      info: wrapInfo(vaultId, epoch, recipient, encPub),
      ekm: { privateKey: ephemeral, publicKey },
    },
    b32.write(key),
    EMPTY,
  );

  return { recipient, enc: new Uint8Array(result.enc), ct: new Uint8Array(result.ct) };
}

export async function openWrap(
  wrap: IWrap,
  encSk: Uint8Array,
  encPub: Uint8Array,
  vaultId: Uint8Array,
  epoch: number,
  commit: Uint8Array,
): Promise<Uint8Array> {
  const key = await decryptWrap(wrap, encSk, encPub, vaultId, epoch);

  requireValue(equal(keyCommit(key, vaultId, epoch), commit), "Epoch commit mismatch");

  return key;
}

async function decryptWrap(
  wrap: IWrap,
  encSk: Uint8Array,
  encPub: Uint8Array,
  vaultId: Uint8Array,
  epoch: number,
) {
  try {
    const recipientKey = await suite.kem.importKey("raw", b32.write(encSk), false);

    return new Uint8Array(
      await suite.open(
        { recipientKey, enc: wrap.enc, info: wrapInfo(vaultId, epoch, wrap.recipient, encPub) },
        wrap.ct,
        EMPTY,
      ),
    );
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Unable to decrypt wrap", { cause });
  }
}
