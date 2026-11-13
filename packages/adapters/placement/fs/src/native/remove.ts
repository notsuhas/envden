import { closeSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { assertIdentity, linkTarget, openParent, readAt } from "./directory.ts";
import { checked, cstring, identity, libc } from "./libc.ts";

export function removeNative(
  root: string,
  path: string,
  storePath: string | undefined,
  beforeUnlink?: () => void,
) {
  const fd = openParent(root, path, false);
  const name = basename(path);

  try {
    const before = identity(fd, name);
    if (!before) return;
    const target = linkTarget(fd, name);

    if (target !== undefined) {
      if (!storePath || resolve(root, dirname(path), target) !== resolve(storePath))
        throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");
    } else readAt(fd, name);

    assertIdentity(fd, name, before);
    beforeUnlink?.();
    checked(libc!.symbols.unlinkat(fd, cstring(name), 0));
  } finally {
    closeSync(fd);
  }
}
