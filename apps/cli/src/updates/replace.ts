import { chmod, rename, rm, lstat, copyFile } from "node:fs/promises";
import { spawnTrusted } from "@envden/core/process";
import { atomicWrite } from "../state/store/files.ts";
import { EnvdenError } from "@envden/core/errors";

export async function replaceBinary(
  path: string,
  bytes: Uint8Array,
  windows: boolean,
  verify = verifyBinary,
  after = async () => {},
) {
  const stat = await lstat(path);

  if (!stat.isFile() || stat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe binary destination");

  const temporary = `${path}.envden-new${windows ? ".exe" : ""}`;
  await atomicWrite(temporary, bytes);
  await chmod(temporary, 0o755);

  try {
    await verify(temporary);
  } catch (cause) {
    await rm(temporary, { force: true });
    throw new EnvdenError("INVALID_DATA", "Release binary verification failed", { cause });
  }

  const old = `${path}.envden-old`;

  let backedUp = false;

  try {
    if (windows) await rename(path, old);
    else await copyFile(path, old);

    backedUp = true;
    await rename(temporary, path);
    await after();
    if (!windows) await rm(old, { force: true });
  } catch (cause) {
    if (backedUp) {
      if (windows) await rm(path, { force: true });
      await rename(old, path);
    }

    await rm(temporary, { force: true });
    throw cause;
  }
}

export async function cleanupOldBinary(path: string, windows: boolean) {
  if (windows) await rm(`${path}.envden-old`, { force: true });
}

async function verifyBinary(path: string) {
  const child = spawnTrusted(path, ["--version"], { stdout: "ignore", stderr: "ignore" });

  if ((await child.exited) !== 0)
    throw new EnvdenError("INVALID_DATA", "Release binary verification failed");
}
