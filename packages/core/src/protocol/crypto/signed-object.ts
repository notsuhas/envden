import { type ICodec } from "../encoding/binary.ts";
import { encode, concat, b64 } from "../encoding/binary.ts";
import { type ISigned } from "../codecs/signed.ts";
import { type TVerification } from "./sign.ts";
import { Sign, Verify } from "./sign.ts";
import { H } from "./hash.ts";

export function signObject<T>(c: ICodec<T>, body: T, sk: Uint8Array, label: string): ISigned<T> {
  return { body, signature: Sign(sk, label, encode(c, body)) };
}

export function verifyObject<T>(
  c: ICodec<T>,
  value: ISigned<T>,
  pub: Uint8Array,
  label: string,
): TVerification<T> {
  try {
    const result = Verify(pub, label, encode(c, value.body), value.signature);

    return result.ok ? { ok: true, value: value.body } : result;
  } catch {
    return { ok: false, reason: "Malformed signed object" };
  }
}

export function objectHash<T>(c: ICodec<T>, value: ISigned<T>, label: string): Uint8Array {
  return H("hash/" + label, concat(encode(c, value.body), b64.write(value.signature)));
}
