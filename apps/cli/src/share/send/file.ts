import { readFile, stat } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";

const MAX_BYTES = 1048576;

// Follows links on purpose: a checkout's env file is usually a link into the store.
export async function readShareFile(path: string): Promise<Uint8Array> {
  const info = await stat(path).catch((cause: unknown) => {
    throw new EnvdenError("NOT_FOUND", "File not found", { cause });
  });

  if (!info.isFile()) throw new EnvdenError("INVALID_INPUT", "Only a regular file can be sent");

  const bytes = new Uint8Array(await readFile(path));

  if (bytes.length > MAX_BYTES)
    throw new EnvdenError("INVALID_INPUT", "Files over 1 MiB can't be sent");

  return bytes;
}
