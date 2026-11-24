import * as p from "@envden/core/protocol";
import { binary } from "../../../../client/encoding.ts";
import { optionalRead } from "../../../../state/store/files.ts";
import { basePath, readBytes } from "../../files.ts";

// Unfinished journals, deletions, unreadable records and a missing store are left for a manual pull.
export async function quietStore(home: string, store: string) {
  const base = basePath(home, store);

  for (const record of [".pending", ".delete", ".corrupt"])
    if ((await readBytes(base + record)) !== undefined) return false;

  return (
    readableEntry(await optionalRead(base + ".entry")) && (await readBytes(store)) !== undefined
  );
}

function readableEntry(saved: string | undefined) {
  if (saved === undefined) return true;

  try {
    p.decode(p.FileEntryCodec, binary(saved));

    return true;
  } catch {
    return false;
  }
}
