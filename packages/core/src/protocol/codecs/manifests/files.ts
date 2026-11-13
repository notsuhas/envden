import { type IFileEntry } from "./file-entry.ts";
import { FileEntryCodec } from "./file-entry.ts";
import { codec, tagged, list, compare, concat, header } from "../../encoding/binary.ts";

export interface IFiles {
  entries: IFileEntry[];
}

export const FilesCodec = codec<IFiles>(
  (r) => {
    tagged(3, r);

    return { entries: list(FileEntryCodec, (a, b) => compare(a.fileId, b.fileId)).read(r) };
  },
  (v) =>
    concat(header(3), list(FileEntryCodec, (a, b) => compare(a.fileId, b.fileId)).write(v.entries)),
);
