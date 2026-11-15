import { rename } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";
import { optionalRead, atomicWrite } from "./files.ts";

export async function readSyncRecord<T>(
  path: string,
  decode: (value: string) => T,
): Promise<T | undefined> {
  const saved = await optionalRead(path);
  if (saved === undefined) return undefined;

  try {
    return decode(saved);
  } catch {
    throw new EnvdenError(
      "INVALID_DATA",
      `Invalid sync state: ${path}; move this file aside and run envden pull`,
    );
  }
}

export async function recoverSyncRecord<T>(
  path: string,
  marker: string,
  decode: (value: string) => T,
  now: number,
  report?: (message: string) => void,
) {
  try {
    return await readSyncRecord(path, decode);
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "INVALID_DATA") throw error;
    const backup = path + ".corrupt-" + String(now).padStart(13, "0") + "_" + crypto.randomUUID();
    await atomicWrite(marker, backup, () => now);
    await rename(path, backup);

    report?.(
      `Invalid sync state: ${path}; saved ${backup}; run envden pull, then envden resolve --list`,
    );

    return undefined;
  }
}

export async function invalidSyncRecord(path: string, decode: (value: string) => unknown) {
  try {
    await readSyncRecord(path, decode);

    return false;
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "INVALID_DATA") return true;
    throw error;
  }
}
