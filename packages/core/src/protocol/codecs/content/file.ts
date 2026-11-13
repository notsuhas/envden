import { codec, tagged, sized, concat, header } from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";
import { validatePath } from "../../files/identity.ts";

export interface IFile {
  repoId: string;
  path: string;
  content: Uint8Array;
}

export const FileCodec = codec<IFile>(
  (r) => {
    tagged(6, r);

    return { repoId: str.read(r), path: str.read(r), content: sized(1048576).read(r) };
  },
  (v) => concat(header(6), str.write(v.repoId), str.write(v.path), sized(1048576).write(v.content)),
  (v) => {
    validatePath(v.path);
  },
);
