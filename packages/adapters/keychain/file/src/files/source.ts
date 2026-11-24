import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { restrictAccess } from "@envden/core/process";

export async function readKeyFile(path: string): Promise<Uint8Array | undefined> {
  const file = await open(path, "r").catch((error: unknown) => {
    if (missing(error)) return undefined;
    throw error;
  });

  if (!file) return undefined;

  try {
    if ((await file.stat()).mode & 0o077)
      throw new EnvdenError("INVALID_DATA", "Key file is accessible to other users");

    return new Uint8Array(await file.readFile());
  } finally {
    await file.close();
  }
}

export async function writeKeyFile(path: string, value: Uint8Array) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await restrictAccess(directory, true);
  const temporary = join(directory, `${crypto.randomUUID()}.tmp`);

  try {
    const file = await open(temporary, "wx", 0o600);

    try {
      await restrictAccess(temporary);
      await file.writeFile(value);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);
    await syncDirectory(directory);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function removeKeyFile(path: string) {
  await rm(path, { force: true });

  await syncDirectory(dirname(path)).catch((error: unknown) => {
    if (!missing(error)) throw error;
  });
}

function missing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function syncDirectory(path: string) {
  const directory = await open(path, "r");

  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
