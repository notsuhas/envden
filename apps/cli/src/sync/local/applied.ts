import { z } from "zod";
import { readSyncRecord } from "../../state/store/records.ts";
import { basePath } from "./files.ts";
import * as p from "@envden/core/protocol";
import { binary, text } from "../../client/encoding.ts";
import { join } from "node:path";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";

export async function appliedFiles(home: string): Promise<Record<string, string>> {
  return (
    (await readSyncRecord(join(home, "state", "applied-files.json"), (saved) => {
      const entries = z.record(z.string(), z.string()).parse(JSON.parse(saved));
      for (const encoded of Object.values(entries)) p.decode(p.FileEntryCodec, binary(encoded));

      return entries;
    })) ?? {}
  );
}

export async function saveAppliedFiles(home: string, files: Record<string, string>): Promise<void> {
  const path = join(home, "state", "applied-files.json");
  const bytes = JSON.stringify(files);
  if ((await optionalRead(path)) === bytes) return;
  await atomicWrite(path, bytes);
}

export async function hasAppliedEntry(
  home: string,
  entry: p.IFileEntry,
  files?: Record<string, string>,
) {
  return (
    (files ?? (await appliedFiles(home)))[p.base32(entry.fileId)] ===
    text(p.FileEntryCodec.write(entry))
  );
}

export async function markAppliedEntry(home: string, encoded: string, store?: string) {
  if (store) await atomicWrite(basePath(home, store) + ".entry", encoded);
  const entry = p.decode(p.FileEntryCodec, new Uint8Array(Buffer.from(encoded, "base64url")));
  const applied = await appliedFiles(home);
  applied[p.base32(entry.fileId)] = encoded;
  await saveAppliedFiles(home, applied);
}
