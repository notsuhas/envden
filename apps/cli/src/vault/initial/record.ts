import * as p from "@envden/core/protocol";
import { text } from "../../client/encoding.ts";
import { appliedFiles, saveAppliedFiles } from "../../sync/local/applied.ts";
import { writeBytes } from "../../sync/local/files.ts";

// the pushed files are now this device's synced baseline, so nothing reads as changed
export async function recordPushed(
  home: string,
  files: p.IFiles,
  bases: Map<string, Uint8Array>,
  now: () => number,
) {
  const applied = await appliedFiles(home);

  for (const entry of files.entries)
    applied[p.base32(entry.fileId)] = text(p.FileEntryCodec.write(entry));

  await saveAppliedFiles(home, applied, now);
  for (const [path, bytes] of bases) await writeBytes(path, bytes, now);
}
