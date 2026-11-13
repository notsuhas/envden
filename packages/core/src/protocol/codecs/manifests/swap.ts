import { type ISigned } from "../signed.ts";
import { signedCodec } from "../signed.ts";
import { type TEntry } from "../entry.ts";
import { EntryCodec } from "../entry.ts";
import { codec, b32, list, opt, blob, bytes, concat } from "../../encoding/binary.ts";
import { type IManifestHeader } from "./header.ts";
import { ManifestHeaderCodec } from "./header.ts";
import { type IFiles } from "./files.ts";
import { FilesCodec } from "./files.ts";

export interface ISwap {
  expectedHead: Uint8Array;
  entries: ISigned<TEntry>[];
  header: ISigned<IManifestHeader>;
  files: IFiles | undefined;
  keyring: Uint8Array | undefined;
  envelope: Uint8Array | undefined;
  skPub: Uint8Array | undefined;
  opaqueRecord: Uint8Array | undefined;
  approver: Uint8Array | undefined;
}

export const SwapCodec = codec<ISwap>(
  (r) => {
    return {
      expectedHead: b32.read(r),
      entries: list(signedCodec(EntryCodec)).read(r),
      header: signedCodec(ManifestHeaderCodec).read(r),
      files: opt(FilesCodec).read(r),
      keyring: opt(blob).read(r),
      envelope: opt(blob).read(r),
      skPub: opt(b32).read(r),
      opaqueRecord: opt(bytes).read(r),
      approver: opt(bytes).read(r),
    };
  },
  (v) =>
    concat(
      b32.write(v.expectedHead),
      list(signedCodec(EntryCodec)).write(v.entries),
      signedCodec(ManifestHeaderCodec).write(v.header),
      opt(FilesCodec).write(v.files),
      opt(blob).write(v.keyring),
      opt(blob).write(v.envelope),
      opt(b32).write(v.skPub),
      opt(bytes).write(v.opaqueRecord),
      opt(bytes).write(v.approver),
    ),
);
