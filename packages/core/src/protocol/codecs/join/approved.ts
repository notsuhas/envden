import { codec, tagged, b32, concat, header } from "../../encoding/binary.ts";

export interface IJoinApproved {
  vaultId: Uint8Array;
  serverPin: Uint8Array;
  manifestHash: Uint8Array;
}

export const JoinApprovedCodec = codec<IJoinApproved>(
  (r) => {
    tagged(8, r);

    return { vaultId: b32.read(r), serverPin: b32.read(r), manifestHash: b32.read(r) };
  },
  (v) => concat(header(8), b32.write(v.vaultId), b32.write(v.serverPin), b32.write(v.manifestHash)),
);
