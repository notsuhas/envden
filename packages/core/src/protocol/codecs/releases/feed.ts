import { type IRelease } from "./body.ts";
import { ReleaseCodec } from "./body.ts";
import { type IReleaseSignature } from "./signature.ts";
import { ReleaseSignatureCodec } from "./signature.ts";
import { codec, list, concat, decode, requireValue } from "../../encoding/binary.ts";

export interface IReleaseFeed {
  body: IRelease;
  signatures: IReleaseSignature[];
}

export const ReleaseFeedCodec = codec<IReleaseFeed>(
  (r) => ({
    body: ReleaseCodec.read(r),
    signatures: list(ReleaseSignatureCodec).read(r),
  }),
  (v) => concat(ReleaseCodec.write(v.body), list(ReleaseSignatureCodec).write(v.signatures)),
  (v) => {
    requireValue(
      v.signatures.length <= 2 &&
        new Set(v.signatures.map((s) => s.key)).size === v.signatures.length,
      "Duplicate release signatures",
    );
  },
);

export function decodeReleaseFeed(data: Uint8Array): IReleaseFeed {
  return decode(ReleaseFeedCodec, data);
}
