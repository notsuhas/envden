import * as p from "@envden/core/protocol";
import { binary } from "../../../../client/encoding.ts";
import { recoverSyncRecord } from "../../../../state/store/records.ts";
import { optionalRead, atomicWrite } from "../../../../state/store/files.ts";
import { basePath, writeBytes } from "../../files.ts";

export async function deletionRequested(home: string, store: string) {
  const base = basePath(home, store);

  return (
    (await recoverSyncRecord(base + ".delete", base + ".corrupt", (saved) => {
      p.decode(p.FileEntryCodec, binary(saved));

      return saved;
    })) !== undefined
  );
}

export async function requestDeletion(
  home: string,
  store: string,
  requested: boolean,
  entry?: string,
) {
  const path = basePath(home, store) + ".delete";

  if (!requested) {
    await writeBytes(path, undefined);

    return;
  }

  const ancestor = entry ?? (await optionalRead(basePath(home, store) + ".entry"));
  if (ancestor) await atomicWrite(path, ancestor);
}
