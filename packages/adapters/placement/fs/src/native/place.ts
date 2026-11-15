import { temporaryName } from "../paths/temporary.ts";
import { closeSync, constants, fstatSync, readFileSync, openSync, fchmodSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { TPlacementMode } from "@envden/core/adapters";
import { assertIdentity, linkTarget, openParent, readAt, writeAt } from "./directory.ts";
import { backupContents } from "../backups/write.ts";
import { sameTarget } from "../paths/same-target.ts";
import { checked, cstring, identity, libc } from "./libc.ts";

export function placeNative(
  mode: TPlacementMode,
  root: string,
  path: string,
  storePath: string,
  beforeRename: (() => void) | undefined,
  backupDirectory: string | undefined,
  now: () => number,
  replacingLink?: string,
) {
  const fd = openParent(root, path);
  const name = basename(path);
  const temporary = temporaryName(path);
  let staged: Buffer | undefined;

  try {
    const before = identity(fd, name);
    let previous: Buffer | undefined;

    if (before) {
      const target = linkTarget(fd, name);

      if (
        target !== undefined &&
        target !== replacingLink &&
        !sameTarget(resolve(root, dirname(path), target), storePath)
      )
        throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");

      if (target === undefined) previous = readAt(fd, name);
    }

    const contents = readStore(storePath);
    if (identity(fd, temporary)) checked(libc!.symbols.unlinkat(fd, cstring(temporary), 0));

    if (mode === "link")
      checked(libc!.symbols.symlinkat(cstring(resolve(storePath)), fd, cstring(temporary)));
    else writeAt(fd, temporary, contents);

    staged = identity(fd, temporary);
    assertIdentity(fd, name, before);

    if (previous && !previous.equals(contents))
      backupContents(root, backupDirectory, previous, undefined, now);

    assertIdentity(fd, name, before);
    assertIdentity(fd, temporary, staged);
    beforeRename?.();
    checked(libc!.symbols.renameat(fd, cstring(temporary), fd, cstring(name)));
  } finally {
    try {
      if (staged && identity(fd, temporary)?.equals(staged))
        checked(libc!.symbols.unlinkat(fd, cstring(temporary), 0));
    } finally {
      closeSync(fd);
    }
  }
}

function readStore(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);

  try {
    if (!fstatSync(fd).isFile())
      throw new EnvdenError("INVALID_INPUT", "Store source is not a regular file");

    fchmodSync(fd, 0o600);

    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
