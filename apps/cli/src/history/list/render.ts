import { sanitizeConsole } from "../../output/sanitize.ts";
import { localTime } from "../../output/time.ts";
import type { TKeyChanges, TVersionKind } from "./changes.ts";
import type { THistoryResult } from "./run.ts";

type TFile = THistoryResult["files"][number];

export function historyText(result: THistoryResult, timeZone?: string) {
  if (result.files.length === 0) return "No env files to show";

  return sanitizeConsole(result.files.map((file) => fileText(file, timeZone)).join("\n\n"));
}

export function changesText(changes: TKeyChanges) {
  if (changes === "unknown") return "changes unknown";
  if (changes === "unparsed") return "changed (file not parsable)";

  const parts = [
    ...(changes.added.length ? [`added ${changes.added.join(", ")}`] : []),
    ...(changes.changed.length ? [`changed ${changes.changed.join(", ")}`] : []),
    ...(changes.removed.length ? [`removed ${changes.removed.join(", ")}`] : []),
  ];

  return parts.length ? parts.join("; ") : "no key changes";
}

function fileText(file: TFile, timeZone?: string) {
  const single = file.checkouts.length === 1;

  const lines = file.versions.map((version) => {
    const marks = file.checkouts
      .filter((checkout) => checkout.version === version.version)
      .map((checkout) => (single ? "<- current" : `<- current in ${checkout.root}`));

    return [
      `  v${version.version}`,
      (version.time ? localTime(version.time, timeZone) : "unknown time").padEnd(22),
      (version.device ?? (version.removedDevice ? "removed device" : "unknown device")).padEnd(16),
      kindText(version.kind, version.changes),
      ...marks,
    ].join("  ");
  });

  const unmatched = file.checkouts
    .filter((checkout) => checkout.version === undefined)
    .map((checkout) => `  ${single ? "This checkout" : checkout.root} matches no retained version`);

  return [
    `${file.repoId} ${file.path}`,
    ...(file.versions.length ? lines : ["  no retained versions"]),
    ...(file.pruned ? ["  older versions pruned"] : []),
    ...unmatched,
  ].join("\n");
}

function kindText(kind: TVersionKind, changes: TKeyChanges) {
  if (kind === "deleted") return "deleted";
  if (kind === "lost") return "lost in a server repair";
  if (kind === "restored") return `restored by a server repair; ${changesText(changes)}`;

  return changesText(changes);
}
