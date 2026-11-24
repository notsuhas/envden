import { chmod, rename, rm, lstat, copyFile } from "node:fs/promises";
import { spawnTrusted } from "@envden/core/process";
import { atomicWrite } from "../state/store/files.ts";
import { EnvdenError } from "@envden/core/errors";

export async function replaceBinary(
  path: string,
  bytes: Uint8Array,
  verify = verifyBinary,
  after = async () => {},
  now: () => number,
) {
  const stat = await lstat(path);

  if (!stat.isFile() || stat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe binary destination");

  const temporary = `${path}.envden-new`;
  await atomicWrite(temporary, bytes, now);
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
    await copyFile(path, old);

    backedUp = true;
    await rename(temporary, path);
    await after();
    await rm(old, { force: true });
  } catch (cause) {
    if (backedUp) await rename(old, path);

    await rm(temporary, { force: true });
    throw cause;
  }
}

async function verifyBinary(path: string) {
  const child = spawnTrusted(path, ["--version"], { stdout: "ignore", stderr: "ignore" });

  if ((await child.exited) !== 0)
    throw new EnvdenError("INVALID_DATA", "Release binary verification failed");
}
