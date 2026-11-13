import { str } from "../encoding/strings.ts";
import { requireValue, b32, concat } from "../encoding/binary.ts";
import { MAC } from "../crypto/mac.ts";

export function validatePath(path: string): void {
  str.write(path);

  requireValue(
    path.length > 0 &&
      !/[\\:]/.test(path) &&
      path
        .split("/")
        .every(
          (s) =>
            s !== "" &&
            s !== "." &&
            s !== ".." &&
            !/[. ]$/.test(s) &&
            !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(s),
        ),
    "Invalid relative path",
  );
}

export function fileId(idKey: Uint8Array, repoId: string, path: string): Uint8Array {
  validatePath(path);

  return MAC(b32.write(idKey), "file-id", concat(str.write(repoId), str.write(path)));
}
