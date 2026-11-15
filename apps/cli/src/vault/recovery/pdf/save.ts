import { open, rm } from "node:fs/promises";
import { join } from "node:path";
import { restrictAccess } from "@envden/core/process";

import { kitFileName } from "./name.ts";

export async function writeKitPdf(
  folder: string,
  vaultId: string,
  bytes: Uint8Array,
): Promise<string> {
  for (let copy = 1; ; copy++) {
    const path = join(folder, kitFileName(vaultId, copy));
    const file = await open(path, "wx", 0o600).catch(skipExisting);
    if (!file) continue;

    try {
      await restrictAccess(path);
      await file.writeFile(bytes);
      await file.close();
    } catch (cause) {
      // A half-written kit is worse than none; the caller prints the kit instead.
      await file.close().catch(() => undefined);
      await rm(path, { force: true });

      throw cause;
    }

    return path;
  }
}

function skipExisting(cause: unknown) {
  if ((cause as NodeJS.ErrnoException).code === "EEXIST") return undefined;

  throw cause;
}
