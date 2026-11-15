import { z } from "zod";
import * as p from "@envden/core/protocol";
import { binary } from "../../../../client/encoding.ts";
import { recoverSyncRecord } from "../../../../state/store/records.ts";
import { optionalRead, atomicWrite } from "../../../../state/store/files.ts";
import { basePath, writeBytes } from "../../files.ts";

const deletionSchema = z.object({ entry: z.string(), targets: z.array(z.string()) });

export function decodeDeletion(saved: string) {
  const intent = deletionSchema.parse(JSON.parse(saved));
  p.decode(p.FileEntryCodec, binary(intent.entry));

  return intent;
}

export async function readDeletion(home: string, store: string, now: () => number) {
  const base = basePath(home, store);

  return recoverSyncRecord(base + ".delete", base + ".corrupt", decodeDeletion, now());
}

export async function deletionRequested(home: string, store: string, now: () => number) {
  return (await readDeletion(home, store, now)) !== undefined;
}

export async function requestDeletion(
  home: string,
  store: string,
  requested: boolean,
  entry: string | undefined,
  targets: string[] | undefined,
  now: () => number,
) {
  const path = basePath(home, store) + ".delete";

  if (!requested) {
    await writeBytes(path, undefined, now);

    return;
  }

  const previous = await readDeletion(home, store, now);
  const ancestor = entry ?? (await optionalRead(basePath(home, store) + ".entry"));

  if (ancestor)
    await atomicWrite(
      path,
      JSON.stringify({ entry: ancestor, targets: targets ?? previous?.targets ?? [] }),
      now,
    );
}
