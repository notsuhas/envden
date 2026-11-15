export type THeldBack =
  | "invalid-state"
  | "oversized"
  | "needs-approval"
  | "excluded"
  | "conflict"
  | "lost"
  | "incomplete";

export const heldBackReasons: Record<THeldBack, string> = {
  "invalid-state": "invalid sync state; run envden pull, then envden resolve --list",
  oversized: "file exceeds 1 MiB; reduce its size before pushing",
  "needs-approval": "checkout needs approval; run envden track",
  excluded: "excluded by env-files; update envden config env-files",
  conflict: "conflict; run envden resolve --list",
  lost: "content was lost outside envden; restore from backup or untrack",
  incomplete: "placement incomplete; run envden pull",
};
