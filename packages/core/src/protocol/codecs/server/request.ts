import { codec, tagged, b32, u64, b16, concat, header } from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";
import { parseSemver } from "../../versions/semver.ts";

export interface IRequest {
  serverPin: Uint8Array;
  vaultId: Uint8Array;
  method: string;
  pathAndQuery: string;
  bodyHash: Uint8Array;
  time: bigint;
  nonce: Uint8Array;
  device: Uint8Array;
  clientVersion: string;
}

export const RequestCodec = codec<IRequest>(
  (r) => {
    tagged(9, r);

    return {
      serverPin: b32.read(r),
      vaultId: b32.read(r),
      method: str.read(r),
      pathAndQuery: str.read(r),
      bodyHash: b32.read(r),
      time: u64.read(r),
      nonce: b16.read(r),
      device: b16.read(r),
      clientVersion: str.read(r),
    };
  },
  (v) =>
    concat(
      header(9),
      b32.write(v.serverPin),
      b32.write(v.vaultId),
      str.write(v.method),
      str.write(v.pathAndQuery),
      b32.write(v.bodyHash),
      u64.write(v.time),
      b16.write(v.nonce),
      b16.write(v.device),
      str.write(v.clientVersion),
    ),
  (v) => {
    parseSemver(v.clientVersion);
  },
);
