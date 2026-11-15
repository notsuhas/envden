import type { TFileStatus } from "../model.ts";

// Mirrors the restore refusals so the page explains them before anyone presses Restore.
export function restoreBlock(status: TFileStatus): string | undefined {
  if (status === "local-only") return "Local-only files have no history on the server.";
  if (status === "conflict") return "Choose a side in Conflicts before restoring.";
  if (status === "detached") return "This file is detached; press Pull to reconcile it first.";

  return undefined;
}
