import type { TFileStatus } from "./model.ts";

const urgency: TFileStatus[] = [
  "conflict",
  "detached",
  "held-back",
  "missing",
  "local-changes",
  "remote-changes",
  "in-sync",
  "local-only",
];

interface IFileFacts {
  localOnly: boolean;
  placement: "linked" | "relinkable" | "detached" | "missing";
  conflict: boolean;
  heldBack: boolean;
  changed: boolean;
  remote: boolean;
}

export function fileStatus(facts: IFileFacts): TFileStatus {
  if (facts.localOnly) return "local-only";
  if (facts.conflict) return "conflict";
  if (facts.placement === "detached") return "detached";
  if (facts.heldBack) return "held-back";
  if (facts.placement === "missing") return "missing";
  if (facts.changed) return "local-changes";

  return facts.remote ? "remote-changes" : "in-sync";
}

export function pendingCount(statuses: TFileStatus[]): number {
  return statuses.filter((status) => status !== "in-sync" && status !== "local-only").length;
}

export function mostUrgent(statuses: TFileStatus[]): TFileStatus {
  return urgency.find((status) => statuses.includes(status)) ?? "in-sync";
}
