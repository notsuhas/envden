import { lineEnding } from "./layout/line-ending.ts";
import { assembleLayout, layoutChanged } from "./layout/assemble.ts";
import { parseSides } from "./entries/sides.ts";
import { shortcut } from "./layout/shortcut.ts";
import { selectEntry } from "./selection.ts";
import { equal } from "./bytes.ts";
import type { IEnvEntry, TMergeResult } from "./types.ts";

export function mergeEnv(base: Uint8Array, local: Uint8Array, remote: Uint8Array): TMergeResult {
  if (equal(base, local)) return shortcut(base, remote);
  if (equal(base, remote) || equal(local, remote)) return shortcut(base, local);

  const parsed = parseSides(base, local, remote);
  if (parsed.kind === "conflict") return parsed;
  const selected = new Map<string, IEnvEntry>();
  const changedKeys: string[] = [];

  for (const [key, [b, l, r]] of parsed.sides) {
    const result = selectEntry(key, b, l, r);
    if (result.kind === "conflict") return result;
    if (result.changed) changedKeys.push(key);
    if (result.entry) selected.set(key, result.entry);
  }

  if (layoutChanged(parsed.files)) return { kind: "conflict", reason: "layout-change" };

  return {
    kind: "clean",
    bytes: assembleLayout(parsed.files, selected, lineEnding(local, base, remote)),
    changedKeys,
  };
}
