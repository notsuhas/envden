import { type IBuild } from "./build.ts";
import { BuildCodec } from "./build.ts";
import { type IKeyPair } from "./key-pair.ts";
import { KeyPairCodec } from "./key-pair.ts";
import {
  codec,
  tagged,
  u32,
  u64,
  list,
  u8,
  opt,
  concat,
  header,
  requireValue,
} from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";
import { parseSemver } from "../../versions/semver.ts";

export interface IRelease {
  generation: number;
  seq: bigint;
  issuedAt: bigint;
  expires: bigint;
  latest: string;
  unsafe: string[];
  builds: IBuild[];
  revokePrimary: number;
  next: IKeyPair | undefined;
}

export const ReleaseCodec = codec<IRelease>(
  (r) => {
    tagged(12, r);

    return {
      generation: u32.read(r),
      seq: u64.read(r),
      issuedAt: u64.read(r),
      expires: u64.read(r),
      latest: str.read(r),
      unsafe: list(str, (a, b) => (a < b ? -1 : a > b ? 1 : 0)).read(r),
      builds: list(BuildCodec, (a, b) =>
        a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0,
      ).read(r),
      revokePrimary: u8.read(r),
      next: opt(KeyPairCodec).read(r),
    };
  },
  (v) =>
    concat(
      header(12),
      u32.write(v.generation),
      u64.write(v.seq),
      u64.write(v.issuedAt),
      u64.write(v.expires),
      str.write(v.latest),
      list(str, (a, b) => (a < b ? -1 : a > b ? 1 : 0)).write(v.unsafe),
      list(BuildCodec, (a, b) =>
        a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0,
      ).write(v.builds),
      u8.write(v.revokePrimary),
      opt(KeyPairCodec).write(v.next),
    ),
  (v) => {
    parseSemver(v.latest);
    v.unsafe.forEach(parseSemver);
    requireValue(v.revokePrimary <= 1);
    requireValue(v.expires === v.issuedAt + 2592000000n, "Invalid release expiry");
  },
);
