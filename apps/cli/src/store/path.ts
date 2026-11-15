import { join, resolve } from "node:path";
import { placeInRoot } from "@envden/core/paths";
import { EnvdenError } from "@envden/core/errors";
import { H, base32, validatePath } from "@envden/core/protocol";

export function storePath(home: string, repoId: string, path: string): string {
  validatePath(path);
  const root = resolve(home, "store", base32(H("local-repo", new TextEncoder().encode(repoId))));
  const result = join(root, path);

  if (placeInRoot(root, result) !== "inside")
    throw new EnvdenError("INVALID_INPUT", "Unsafe store path");

  return result;
}
