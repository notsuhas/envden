import { type ICodec } from "../encoding/binary.ts";
import { decode, encode, requireValue, EMPTY } from "../encoding/binary.ts";
import { sealBox, openBox } from "../crypto/box.ts";
import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";
import { PairJoinerCodec } from "../codecs/pairing/joiner.ts";
import { type IPairJoiner } from "../codecs/pairing/joiner.ts";
import { PairApproverCodec } from "../codecs/pairing/approver.ts";
import { type IPairApprover } from "../codecs/pairing/approver.ts";

function seal<T>(c: ICodec<T>, value: T, key: Uint8Array, rng: TRandom): Uint8Array {
  const box = sealBox(key, encode(c, value), EMPTY, rng);
  requireValue(box.length <= 4096, "Pair message limit");

  return box;
}

function open<T>(c: ICodec<T>, box: Uint8Array, key: Uint8Array): T {
  requireValue(box.length <= 4096, "Pair message limit");

  return decode(c, openBox(key, box));
}

export function sealPairJoiner(
  value: IPairJoiner,
  key: Uint8Array,
  rng: TRandom = randomBytes,
): Uint8Array {
  return seal(PairJoinerCodec, value, key, rng);
}

export function openPairJoiner(box: Uint8Array, key: Uint8Array): IPairJoiner {
  return open(PairJoinerCodec, box, key);
}

export function sealPairApprover(
  value: IPairApprover,
  key: Uint8Array,
  rng: TRandom = randomBytes,
): Uint8Array {
  return seal(PairApproverCodec, value, key, rng);
}

export function openPairApprover(box: Uint8Array, key: Uint8Array): IPairApprover {
  return open(PairApproverCodec, box, key);
}
