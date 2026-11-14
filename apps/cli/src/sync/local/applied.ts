import * as p from "@envden/core/protocol";
import { text } from "../../client/encoding.ts";
import { join } from "node:path";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";

export async function appliedFiles(home: string): Promise<Record<string, string>> {
  return JSON.parse((await optionalRead(join(home, "state", "applied-files.json"))) ?? "{}");
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

export async function markAppliedEntry(home: string, encoded: string) {
  const entry = p.decode(p.FileEntryCodec, new Uint8Array(Buffer.from(encoded, "base64url")));
  const applied = await appliedFiles(home);
  applied[p.base32(entry.fileId)] = encoded;
  await saveAppliedFiles(home, applied);
}
