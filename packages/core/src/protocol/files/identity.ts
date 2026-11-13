import { str } from "../encoding/strings.ts";
import { requireValue, b32, concat } from "../encoding/binary.ts";
import { MAC } from "../crypto/mac.ts";

export function validatePath(path: string): void {
  str.write(path);

  requireValue(
    path.length > 0 &&
      !path.includes("\\") &&
      path.split("/").every((s) => s !== "" && s !== "." && s !== ".."),
    "Invalid relative path",
  );
}

export function fileId(idKey: Uint8Array, repoId: string, path: string): Uint8Array {
  validatePath(path);

  return MAC(b32.write(idKey), "file-id", concat(str.write(repoId), str.write(path)));
}
