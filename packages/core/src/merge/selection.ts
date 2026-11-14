import { equal } from "./bytes.ts";
import type { IEnvEntry, TConflict } from "./types.ts";

export function selectEntry(
  key: string,
  original: IEnvEntry | undefined,
  mine: IEnvEntry | undefined,
  theirs: IEnvEntry | undefined,
): TConflict | { kind: "selected"; changed: boolean; entry?: IEnvEntry | undefined } {
  const lc = !equal(original?.raw, mine?.raw);
  const rc = !equal(original?.raw, theirs?.raw);

  if (lc && rc && equal(mine?.raw, theirs?.raw))
    return { kind: "selected", changed: true, entry: mine };

  if (styleChanged(original, mine) || styleChanged(original, theirs))
    return { kind: "conflict", reason: "style-change", key };

  if (lc && rc) return concurrentChange(key, original, mine, theirs);

  return { kind: "selected", changed: lc || rc, entry: rc ? theirs : mine } as const;
}

function styleChanged(original: IEnvEntry | undefined, entry: IEnvEntry | undefined) {
  return (
    original && entry && (original.exported !== entry.exported || original.quote !== entry.quote)
  );
}

function concurrentChange(
  key: string,
  original: IEnvEntry | undefined,
  mine: IEnvEntry | undefined,
  theirs: IEnvEntry | undefined,
): ReturnType<typeof selectEntry> {
  if (!mine || !theirs) return { kind: "conflict", reason: "delete-vs-edit", key };

  if (original && (original.active !== mine.active || original.active !== theirs.active))
    return { kind: "conflict", reason: "comment-toggle-vs-edit", key };

  return { kind: "conflict", reason: "both-changed", key };
}
