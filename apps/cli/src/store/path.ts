import { join, resolve, relative } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { H, base32, validatePath } from "@envden/core/protocol";

export function storePath(home: string, repoId: string, path: string): string {
  validatePath(path);
  const root = resolve(home, "store", base32(H("local-repo", new TextEncoder().encode(repoId))));
  const result = join(root, path);
  const rel = relative(root, result);

  if (rel.startsWith("..") || rel === "")
    throw new EnvdenError("INVALID_INPUT", "Unsafe store path");

  return result;
}
