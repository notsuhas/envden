import type { diffEnvKeys } from "@envden/core/merge";
import type { TKeyChanges } from "./model.ts";

export function keyChanges(result: ReturnType<typeof diffEnvKeys>): TKeyChanges {
  if (result.kind === "diff")
    return { kind: "diff", added: result.added, removed: result.removed, changed: result.changed };

  return { kind: "unparsed", reason: result.reason, ...(result.key ? { key: result.key } : {}) };
}
