import { type IOlderKey } from "./older-key.ts";
import { OlderKeyCodec } from "./older-key.ts";
import {
  codec,
  tagged,
  b32,
  u32,
  list,
  concat,
  header,
  requireValue,
} from "../../encoding/binary.ts";

export interface IKeyring {
  vaultId: Uint8Array;
  epoch: number;
  idKey: Uint8Array;
  older: IOlderKey[];
}

export const KeyringCodec = codec<IKeyring>(
  (r) => {
    tagged(4, r);

    return {
      vaultId: b32.read(r),
      epoch: u32.read(r),
      idKey: b32.read(r),
      older: list(OlderKeyCodec, (a, b) => a.epoch - b.epoch).read(r),
    };
  },
  (v) =>
    concat(
      header(4),
      b32.write(v.vaultId),
      u32.write(v.epoch),
      b32.write(v.idKey),
      list(OlderKeyCodec, (a, b) => a.epoch - b.epoch).write(v.older),
    ),
  (v) => {
    requireValue(
      v.epoch >= 1 && v.older.length === v.epoch - 1 && v.older.every((k, i) => k.epoch === i + 1),
      "Noncontiguous epochs",
    );
  },
);
