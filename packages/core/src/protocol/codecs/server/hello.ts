import {
  codec,
  tagged,
  b32,
  list,
  u8,
  concat,
  header,
  requireValue,
} from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";
import { validateEdPublic } from "../../keys/validation.ts";
import { parseSemver } from "../../versions/semver.ts";

export interface IServerHello {
  challenge: Uint8Array;
  host: string;
  serverSignPub: Uint8Array;
  appVersion: string;
  minClient: string;
  protocols: number[];
}

export const ServerHelloCodec = codec<IServerHello>(
  (r) => {
    tagged(10, r);

    return {
      challenge: b32.read(r),
      host: str.read(r),
      serverSignPub: b32.read(r),
      appVersion: str.read(r),
      minClient: str.read(r),
      protocols: list(u8, (a, b) => a - b).read(r),
    };
  },
  (v) =>
    concat(
      header(10),
      b32.write(v.challenge),
      str.write(v.host),
      b32.write(v.serverSignPub),
      str.write(v.appVersion),
      str.write(v.minClient),
      list(u8, (a, b) => a - b).write(v.protocols),
    ),
  (v) => {
    validateEdPublic(v.serverSignPub);
    parseSemver(v.appVersion);
    parseSemver(v.minClient);
    requireValue(v.host === v.host.toLowerCase());
  },
);
