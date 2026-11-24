import {
  closeSync,
  fchmodSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
  chmodSync,
  lstatSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { placeInRoot } from "@envden/core/paths";
import { EnvdenError } from "@envden/core/errors";
import { openParent, writeAt } from "../native/directory.ts";
import { libc } from "../native/libc.ts";

export function backupContents(
  root: string,
  directory: string | undefined,
  contents: Uint8Array,
  runtime = { libc },
  now: () => number,
) {
  if (!directory) throw new EnvdenError("INVALID_INPUT", "Backup directory is required");
  const path = resolve(directory);
  assertOutside(root, path);

  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertOutside(realpathSync(root), realpathSync(path));
  const name = `.envden-backup-${now()}-${randomUUID()}`;

  if (runtime.libc) {
    const fd = openParent(path, name, false);

    try {
      fchmodSync(fd, 0o700);
      writeAt(fd, name, contents);
    } finally {
      closeSync(fd);
    }
  } else {
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())
      throw new EnvdenError("INVALID_INPUT", "Unsafe backup directory");

    chmodSync(path, 0o700);

    writeFileSync(join(path, name), contents, { flag: "wx", mode: 0o600 });
  }
}

function assertOutside(root: string, path: string) {
  if (placeInRoot(root, path) !== "outside")
    throw new EnvdenError("INVALID_INPUT", "Backup directory must be outside checkout");
}
