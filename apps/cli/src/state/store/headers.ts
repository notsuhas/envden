import { createHash } from "node:crypto";
import { join } from "node:path";
import { atomicWrite, optionalRead } from "./files.ts";
import { EnvdenError } from "@envden/core/errors";

export async function storeHeaders(home: string, headers: string[]) {
  const refs: string[] = [];

  for (const header of headers) {
    const hash = createHash("sha256").update(header).digest("hex");
    const path = join(home, "state", "headers", hash);
    if ((await optionalRead(path)) === undefined) await atomicWrite(path, header);
    refs.push(hash);
  }

  return refs;
}

export async function restoreHeaders(home: string, refs: string[]) {
  return Promise.all(
    refs.map(async (hash) => {
      if (!/^[a-f0-9]{64}$/.test(hash))
        throw new EnvdenError("INVALID_DATA", "Invalid header reference");

      const header = await optionalRead(join(home, "state", "headers", hash));

      if (header === undefined || createHash("sha256").update(header).digest("hex") !== hash)
        throw new EnvdenError("INVALID_DATA", "Missing stored header");

      return header;
    }),
  );
}
