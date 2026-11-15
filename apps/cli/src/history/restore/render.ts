import { sanitizeConsole } from "../../output/sanitize.ts";
import { changesText } from "../list/render.ts";
import type { TRestoreResult } from "./run.ts";

export function restoreText(result: TRestoreResult) {
  const lines = {
    unchanged: [`${result.path} already matches version ${result.version}`],
    cancelled: ["Restore cancelled"],
    restored: [
      `Restored ${result.path} to version ${result.version} as a local edit: ${changesText(result.changes)}`,
      "Review it with envden diff, then run envden push to publish it",
    ],
  }[result.kind];

  return sanitizeConsole(lines.join("\n"));
}
