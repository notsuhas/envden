import { type ICodec, codec, b64, concat } from "../encoding/binary.ts";

export interface ISigned<T> {
  body: T;
  signature: Uint8Array;
}

export function signedCodec<T>(body: ICodec<T>) {
  return codec<ISigned<T>>(
    (r) => ({ body: body.read(r), signature: b64.read(r) }),
    (v) => concat(body.write(v.body), b64.write(v.signature)),
  );
}
