import { codec, tagged, concat, header } from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";
import { validatePath } from "../../files/identity.ts";

export interface IFileName {
  repoId: string;
  path: string;
}

export const FileNameCodec = codec<IFileName>(
  (r) => {
    tagged(13, r);

    return { repoId: str.read(r), path: str.read(r) };
  },
  (v) => concat(header(13), str.write(v.repoId), str.write(v.path)),
  (v) => {
    validatePath(v.path);
  },
);
