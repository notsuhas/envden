import { codec, b32, concat } from "../../encoding/binary.ts";
import { validateEdPublic } from "../../keys/validation.ts";

export interface IKeyPair {
  primary: Uint8Array;
  backup: Uint8Array;
}

export const KeyPairCodec = codec<IKeyPair>(
  (r) => {
    return { primary: b32.read(r), backup: b32.read(r) };
  },
  (v) => concat(b32.write(v.primary), b32.write(v.backup)),
  (v) => {
    validateEdPublic(v.primary);
    validateEdPublic(v.backup);
  },
);
