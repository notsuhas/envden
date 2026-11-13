import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { ILocalState } from "./model.ts";
import { atomicWrite, optionalRead } from "./files.ts";

export async function journalPlacement(home: string, state: ILocalState) {
  await atomicWrite(
    join(home, "state", "placement.json"),
    JSON.stringify({ checkpoint: state.checkpoint, links: state.links }),
  );
}

export async function restorePlacement(home: string, state: ILocalState) {
  const text = await optionalRead(join(home, "state", "placement.json"));
  if (!text) return;
  const journal = JSON.parse(text);
  if (journal.checkpoint !== state.checkpoint || !Array.isArray(journal.links)) return;

  for (const link of journal.links) {
    if (!state.links.some((item) => item.root === link.root && item.path === link.path))
      state.links.push(link);
  }
}

export async function clearPlacement(home: string) {
  await rm(join(home, "state", "placement.json"), { force: true });
}
