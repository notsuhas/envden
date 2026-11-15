import type { THeldBack } from "../../sync/local/lineage/reasons.ts";

export type TFileStatus =
  | "in-sync"
  | "local-changes"
  | "remote-changes"
  | "conflict"
  | "detached"
  | "missing"
  | "local-only"
  | "held-back";

export type TApproval = "approved" | "changed" | "needs-approval" | "unavailable";

export type TKeyChanges =
  | { kind: "diff"; added: string[]; removed: string[]; changed: string[] }
  | { kind: "unparsed"; reason: string; key?: string };

export interface IFileView {
  path: string;
  mode: "link" | "copy";
  status: TFileStatus;
  held?: THeldBack;
  conflictId?: string;
  keys?: TKeyChanges;
}

export interface ICheckoutView {
  root: string;
  approval: TApproval;
  files: IFileView[];
}

export interface IRepoView {
  repoId: string;
  status: TFileStatus;
  checkouts: ICheckoutView[];
}

export interface IConflictView {
  id: string;
  path: string;
  roots: string[];
  keys: TKeyChanges;
  serverDeleted: boolean;
  mineDeleted: boolean;
}

export type TUnlock =
  | { kind: "until"; until: number }
  | { kind: "never" }
  | { kind: "locked" }
  | { kind: "unrecorded" }
  | { kind: "unknown" };

export interface IOverview {
  vaultId: string;
  server: { address: string; reachability: string };
  deviceName: string;
  unlock: TUnlock;
  checkedAt: number;
  pending: number;
}

export type TDashboardStatus =
  | { kind: "not-configured" }
  | { kind: "configured"; overview: IOverview; repos: IRepoView[]; conflicts: IConflictView[] };

export interface IDeviceView {
  id: string;
  name: string;
  current: boolean;
  unconfirmed: boolean;
  recoveryKeyHeld: boolean;
  clientVersion: string | null;
}

export type THistoryChanges =
  | { added: string[]; changed: string[]; removed: string[] }
  | "unparsed"
  | "unknown";

export interface IVersionView {
  version: number;
  kind: "live" | "deleted" | "restored" | "lost";
  time?: string;
  device?: string;
  removedDevice?: true;
  changes: THistoryChanges;
}

export interface IHistoryView {
  repoId: string;
  path: string;
  pruned: boolean;
  checkouts: { root: string; version?: number }[];
  versions: IVersionView[];
}

export interface IRestoreView {
  kind: "unchanged" | "cancelled" | "restored";
  path: string;
  version: number;
  changes: THistoryChanges;
}
