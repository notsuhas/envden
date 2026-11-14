import { readSyncRecord } from "../store/records.ts";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { ILocalState } from "../model.ts";
import { atomicWrite, optionalRead } from "../store/files.ts";

export async function journalPlacement(home: string, state: ILocalState) {
  const path = join(home, "state", "placement.json");
  const bytes = JSON.stringify({ checkpoint: state.checkpoint, links: state.links });
  if ((await optionalRead(path)) === bytes) return;
  await atomicWrite(path, bytes);
}

export async function restorePlacement(home: string, state: ILocalState) {
  const journal = await readSyncRecord<{ checkpoint: string; links: ILocalState["links"] }>(
    join(home, "state", "placement.json"),
    (saved) => JSON.parse(saved),
  );

  if (!journal) return;
  if (journal.checkpoint !== state.checkpoint || !Array.isArray(journal.links)) return;

  for (const link of journal.links) {
    if (!state.links.some((item) => item.root === link.root && item.path === link.path))
      state.links.push(link);
  }
}

export async function clearPlacement(home: string) {
  await rm(join(home, "state", "placement.json"), { force: true });
}
