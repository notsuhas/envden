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
import { isAbsolute, relative, resolve, sep, join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { openParent, writeAt } from "../native/directory.ts";
import { libc } from "../native/libc.ts";
import { spawnTrusted } from "@envden/core/process";
import { userInfo } from "node:os";

export function backupContents(
  root: string,
  directory: string | undefined,
  contents: Uint8Array,
  runtime = {
    libc,
    spawn: (args: string[]) => spawnTrusted("icacls", args, { sync: true }).exitCode,
  },
) {
  if (!directory) throw new EnvdenError("INVALID_INPUT", "Backup directory is required");
  const path = resolve(directory);
  assertOutside(root, path);

  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertOutside(realpathSync(root), realpathSync(path));
  const name = `.envden-backup-${randomUUID()}`;

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

    const result = runtime.spawn([
      path,
      "/inheritance:r",
      "/grant:r",
      `${userInfo().username}:(OI)(CI)F`,
    ]);

    if (result !== 0) throw new EnvdenError("INVALID_INPUT", "Could not restrict backup access");

    writeFileSync(join(path, name), contents, { flag: "wx", mode: 0o600 });
  }
}

function assertOutside(root: string, path: string) {
  const inside = relative(root, path);

  if (!inside || (inside.split(sep)[0] !== ".." && !isAbsolute(inside)))
    throw new EnvdenError("INVALID_INPUT", "Backup directory must be outside checkout");
}
