import { milliseconds } from "date-fns";
import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import type { ILocalState } from "../../state/model.ts";
import { readConfig } from "../../settings/config.ts";
import { pull } from "../../sync/engine.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import { boundedFetch } from "../fetch.ts";
import { pulledFileLine } from "./lines.ts";
import { readRemoteNotice } from "../remote.ts";
import { fileLabel, type TChangedFile } from "./details.ts";

// Only the shell's background refresh calls this; pull itself writes clean fast-forwards only.
export async function autoPull(adapters: TAdapters, state: ILocalState, fetcher: TFetch) {
  const waiting = (await readRemoteNotice(adapters.home))?.files ?? [];
  if (!(await readConfig(adapters.home))["auto-pull"] || !waiting.length) return;

  const result = await pull(adapters, {
    now: adapters.now,
    fetcher: boundedFetch(fetcher, AbortSignal.timeout(milliseconds({ seconds: 10 }))),
    all: true,
    interactive: false,
    fastForwardOnly: true,
  });

  if (result.kind !== "pulled" || !result.placed.length) return;
  const lines = pulledFiles(state, waiting, result.placed).map(pulledFileLine);

  await withStateLock(adapters.home, async () => {
    const path = join(adapters.home, "state", "notice-pulled");
    const unseen = (await optionalRead(path)) ?? "";
    const added = lines.map((line) => `${sanitizeTerminal(line)}\n`).join("");

    await atomicWrite(path, unseen + added, adapters.now);
  });
}

export function pulledFiles(
  state: ILocalState,
  waiting: TChangedFile[],
  placed: { repoId: string; path: string }[],
): TChangedFile[] {
  return placed.map(
    (name) =>
      waiting.find((file) => file.repoId === name.repoId && file.path === name.path) ?? {
        ...name,
        label: fileLabel(state, name),
        keys: [],
      },
  );
}
