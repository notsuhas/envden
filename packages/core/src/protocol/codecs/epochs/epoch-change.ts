import { type IWrap } from "./wrap.ts";
import { WrapCodec } from "./wrap.ts";
import { codec, u32, b32, list, compare, concat } from "../../encoding/binary.ts";

export interface IEpochChange {
  epoch: number;
  keyCommit: Uint8Array;
  wraps: IWrap[];
}

export const EpochChangeCodec = codec<IEpochChange>(
  (r) => {
    return {
      epoch: u32.read(r),
      keyCommit: b32.read(r),
      wraps: list(WrapCodec, (a, b) => compare(a.recipient, b.recipient)).read(r),
    };
  },
  (v) =>
    concat(
      u32.write(v.epoch),
      b32.write(v.keyCommit),
      list(WrapCodec, (a, b) => compare(a.recipient, b.recipient)).write(v.wraps),
    ),
);
