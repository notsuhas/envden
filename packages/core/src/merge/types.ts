export interface IEnvEntry {
  key: string;
  raw: Uint8Array;
  exported: boolean;
  quote: string;
  active: boolean;
}

type TConflictReason =
  | "duplicate-key"
  | "unterminated-quote"
  | "multiline-value"
  | "unsupported-syntax"
  | "both-changed"
  | "delete-vs-edit"
  | "style-change"
  | "comment-toggle-vs-edit"
  | "layout-change";

export type TConflict = { kind: "conflict"; reason: TConflictReason; key?: string };

export type TParseResult =
  | { kind: "parsed"; head: Uint8Array; entries: IEnvEntry[]; tail: Uint8Array }
  | TConflict;

export type TMergeResult = { kind: "clean"; bytes: Uint8Array; changedKeys: string[] } | TConflict;
