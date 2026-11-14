import { temporaryName, prepareTemporaryFile } from "../paths/temporary.ts";
import { backupContents } from "../backups/write.ts";
import { libc } from "../native/libc.ts";
import { placeNative } from "../native/place.ts";
import { constants } from "node:fs";
import { EnvdenError } from "@envden/core/errors";
import { parentIdentity, verifyParents } from "../paths/parent-identity.ts";
import { privateFile } from "../permissions/private.ts";
import type { TPlacementMode } from "@envden/core/adapters";
import { statOrMissing } from "./stat.ts";
import { isStoreLink } from "./link.ts";
import { checkoutRelative } from "../paths/checkout-relative.ts";
import { lstat, open, rename, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { safeParents } from "../paths/safe-parents.ts";

export async function place(
  mode: TPlacementMode,
  root: string,
  storePath: string,
  checkoutPath: string,
  backupDirectory?: string,
  runtime = { platform: process.platform, libc },
  prepareTemporary?: (path: string) => Promise<void>,
): Promise<void> {
  const path = checkoutRelative(root, checkoutPath);

  await prepareTemporaryFile(mode, path, prepareTemporary);

  if (runtime.libc) {
    placeNative(mode, root, path, storePath, undefined, backupDirectory);

    return;
  }

  await safeParents(root, path);
  const destination = resolve(checkoutPath);
  const parents = await parentIdentity(root, destination);
  const existing = await statOrMissing(destination);

  if (existing?.isSymbolicLink() && !(await isStoreLink(storePath, destination)))
    throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");

  if (existing && !existing.isFile() && !existing.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

  const storeStat = await lstat(storePath);

  if (!storeStat.isFile() || storeStat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Store source is not a regular file");

  await privateFile(storePath);
  const temporary = join(dirname(destination), temporaryName(path));

  await rm(temporary, { force: true });

  let staged;

  try {
    if (mode === "link") {
      await symlink(resolve(storePath), temporary);
      staged = await lstat(temporary);
    } else {
      const file = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );

      try {
        staged = await file.stat();
        await privateFile(temporary);
        await verifyParents(parents, destination);
        const source = await open(storePath, constants.O_RDONLY | constants.O_NOFOLLOW);

        try {
          await file.writeFile(await source.readFile());
        } finally {
          await source.close();
        }
      } finally {
        await file.close();
      }
    }

    await verifyParents(parents, destination);
    await backupDestination(root, backupDirectory, destination, existing, storePath, parents);
    await verifyParents(parents, destination);

    if (!sameIdentity(existing, await statOrMissing(destination)))
      throw new EnvdenError("CONFLICT", "Destination changed during placement");

    const current = await lstat(temporary);

    if (staged?.dev !== current.dev || staged.ino !== current.ino)
      throw new EnvdenError("CONFLICT", "Staged file changed");

    // Windows: parent replacement after this check remains possible.
    await rename(temporary, destination);
  } finally {
    await verifyParents(parents, destination);
    const leftover = await statOrMissing(temporary);

    if (staged && leftover?.dev === staged.dev && leftover.ino === staged.ino)
      await rm(temporary, { force: true });
  }
}

function sameIdentity(
  before: Awaited<ReturnType<typeof statOrMissing>>,
  after: Awaited<ReturnType<typeof statOrMissing>>,
) {
  if (!before || !after) return before === after;

  return (["dev", "ino", "size", "mtimeMs", "ctimeMs"] as const).every(
    (key) => before[key] === after[key],
  );
}

async function backupDestination(
  root: string,
  backupDirectory: string | undefined,
  destination: string,
  existing: Awaited<ReturnType<typeof statOrMissing>>,
  storePath: string,
  parents: Awaited<ReturnType<typeof parentIdentity>>,
) {
  if (!existing) return;

  const source = await open(
    existing.isSymbolicLink() ? storePath : destination,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );

  try {
    if (!existing.isSymbolicLink() && !sameIdentity(existing, await source.stat()))
      throw new EnvdenError("CONFLICT", "Destination changed before backup");

    const contents = await source.readFile();
    const store = await open(storePath, constants.O_RDONLY | constants.O_NOFOLLOW);

    try {
      await verifyParents(parents, destination);
      if (!contents.equals(await store.readFile())) backupContents(root, backupDirectory, contents);
    } finally {
      await store.close();
    }
  } finally {
    await source.close();
  }
}
