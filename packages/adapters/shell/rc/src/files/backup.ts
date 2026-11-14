import { execTrusted } from "@envden/core/process";
import { userInfo } from "node:os";
import { verifyWindowsOwner } from "./windows.ts";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";

export async function backupRc(directory: string, original: Uint8Array) {
  await mkdir(directory, { recursive: true, mode: 0o700 });

  if (process.platform === "win32") {
    await verifyWindowsOwner(directory);

    await execTrusted("icacls", [
      directory,
      "/inheritance:r",
      "/grant:r",
      `${userInfo().username}:(OI)(CI)F`,
    ]);
  }

  const folder = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);

  try {
    const stat = await folder.stat();

    if (
      !stat.isDirectory() ||
      (process.platform !== "win32" &&
        (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0))
    )
      throw new EnvdenError("INVALID_INPUT", "Unsafe shell backup directory");

    const file = await open(join(directory, `.envden-backup-${randomUUID()}`), "wx", 0o600);

    try {
      await file.writeFile(original);
      await file.sync();
    } finally {
      await file.close();
    }
  } finally {
    await folder.close();
  }
}
