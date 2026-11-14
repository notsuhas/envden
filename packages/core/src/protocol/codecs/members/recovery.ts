import { codec, b16, b32, concat, requireValue, compare } from "../../encoding/binary.ts";
import { recoveryId } from "../../keys/identifiers.ts";
import { validateEdPublic, validateEncPublic } from "../../keys/validation.ts";

export interface IRecoveryRecord {
  id: Uint8Array;
  encPub: Uint8Array;
  objPub: Uint8Array;
}

export const RecoveryRecordCodec = codec<IRecoveryRecord>(
  (r) => {
    return { id: b16.read(r), encPub: b32.read(r), objPub: b32.read(r) };
  },
  (v) => concat(b16.write(v.id), b32.write(v.encPub), b32.write(v.objPub)),
  (v) => {
    validateEncPublic(v.encPub);
    validateEdPublic(v.objPub);
    requireValue(compare(v.id, recoveryId(v)) === 0, "Recovery ID mismatch");
  },
);
