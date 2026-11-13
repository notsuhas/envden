import { type IEpochChange } from "../epochs/epoch-change.ts";
import { EpochChangeCodec } from "../epochs/epoch-change.ts";
import { codec, concat } from "../../encoding/binary.ts";

export interface INewEpoch {
  change: IEpochChange;
}

export const NewEpochCodec = codec<INewEpoch>(
  (r) => {
    return { change: EpochChangeCodec.read(r) };
  },
  (v) => concat(EpochChangeCodec.write(v.change)),
);
