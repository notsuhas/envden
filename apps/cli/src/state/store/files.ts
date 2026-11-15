import { restrictAccess } from "@envden/core/process";
import { mkdir, open, rename, rm, readFile, lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { placeInRoot } from "@envden/core/paths";
import { EnvdenError } from "@envden/core/errors";

const owned = new Set<string>();

export async function privateDirectory(path: string): Promise<void> {
  await prepareDirectory(path);
  await restrictAccess(path, true);
  owned.add(resolve(path));
}

export async function atomicWrite(
  path: string,
  bytes: string | Uint8Array,
  now: () => number,
): Promise<void> {
  const parent = dirname(path);

  if ([...owned].some((root) => placeInRoot(root, parent) !== "outside"))
    await privateDirectory(parent);
  else await prepareDirectory(parent);

  const temporary = join(
    dirname(path),
    `.${String(now()).padStart(13, "0")}_${crypto.randomUUID()}.tmp`,
  );

  try {
    const file = await open(temporary, "wx", 0o600);

    try {
      await restrictAccess(temporary, false);
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);

    if (process.platform !== "win32") {
      const directory = await open(dirname(path), "r");

      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function optionalRead(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path);

    if (!stat.isFile() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_DATA", "Unsafe state file");

    return await readFile(path, "utf8");
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
}

async function prepareDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);

  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe state directory");
}
