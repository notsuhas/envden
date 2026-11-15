import type {
  IFileView,
  IHistoryView,
  IVersionView,
  THistoryChanges,
} from "../../../view/model.ts";
import { restoreBlock } from "../../../view/guidance/restore.ts";
import { chip } from "../chip.ts";
import { button, el, table } from "../dom.ts";
import { windowPane } from "../window.ts";
import { historyKeys, versionChanges } from "./changes.ts";

export type TOutcome =
  | { kind: "restored" | "unchanged"; version: number; changes: THistoryChanges }
  | { kind: "refused"; message: string };

export interface IHistoryPane {
  root: string;
  file: IFileView;
  history: IHistoryView;
  asking?: number | undefined;
  outcome?: TOutcome | undefined;
}

export interface IHistoryActions {
  ask: (version: number) => void;
  restore: (version: number) => void;
  cancel: () => void;
  close: () => void;
}

const stamp: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

export function historyPane(pane: IHistoryPane, actions: IHistoryActions): HTMLElement {
  const { root, file, history } = pane;
  const current = history.checkouts.find((checkout) => checkout.root === root)?.version;
  const block = restoreBlock(file.status);

  const rows = history.versions.map((version) => [
    el("span", { className: "row" }, [
      el("span", { className: "mono", text: `v${version.version}` }),
      ...(version.version === current
        ? [el("span", { className: "chip", text: "current", data: { tone: "warm" } })]
        : []),
    ]),
    el("span", { className: "mono muted", text: when(version) }),
    el("span", { text: origin(version) }),
    versionChanges(version),
    restorable(version, current, block)
      ? button(
          "Restore as local edit",
          "quiet",
          `Restore v${version.version} of ${file.path}`,
          () => actions.ask(version.version),
        )
      : el("span"),
  ]);

  return windowPane(`${history.repoId} ${file.path}`, chip(file.status), true, [
    el("div", { className: "row" }, [
      el("span", { className: "mono muted", text: root }),
      button("Close", "link", "Close history", actions.close),
    ]),
    ...(block ? [el("p", { className: "callout", text: block })] : []),
    history.versions.length
      ? table(["Version", "Time", "Device", "Keys", ""], rows)
      : el("p", { className: "empty", text: "No retained versions." }),
    ...footnotes(history, current),
    ...(pane.asking === undefined ? [] : [confirmStrip(file, pane.asking, actions)]),
    ...(pane.outcome ? [outcomeStrip(file, pane.outcome)] : []),
  ]);
}

function restorable(version: IVersionView, current: number | undefined, block?: string) {
  return (
    !block &&
    version.version !== current &&
    (version.kind === "live" || version.kind === "restored")
  );
}

function when(version: IVersionView) {
  return version.time ? new Date(version.time).toLocaleString(undefined, stamp) : "unknown time";
}

function origin(version: IVersionView) {
  return version.device ?? (version.removedDevice ? "removed device" : "unknown device");
}

function footnotes(history: IHistoryView, current: number | undefined) {
  return [
    ...(history.pruned ? ["Older versions pruned."] : []),
    ...(current === undefined && history.versions.length
      ? ["This checkout matches no retained version."]
      : []),
  ].map((text) => el("p", { className: "muted", text }));
}

function confirmStrip(file: IFileView, version: number, actions: IHistoryActions) {
  return el("div", { className: "strip", data: { tone: "warm" } }, [
    el("p", {
      text: `Restore v${version} of ${file.path} as a local edit? Your current file is backed up first, and nothing reaches the server until you Push.`,
    }),
    el("div", { className: "actions" }, [
      button(`Restore v${version}`, "primary", `Confirm restoring v${version}`, () =>
        actions.restore(version),
      ),
      button("Cancel", "quiet", "Cancel restore", actions.cancel),
    ]),
  ]);
}

function outcomeStrip(file: IFileView, outcome: TOutcome) {
  if (outcome.kind === "refused")
    return el("div", { className: "strip", data: { tone: "alarm" } }, [
      el("p", { text: outcome.message }),
    ]);

  if (outcome.kind === "unchanged")
    return el("div", { className: "strip" }, [
      el("p", { text: `${file.path} already matches v${outcome.version}.` }),
    ]);

  return el("div", { className: "strip", data: { tone: "warm" } }, [
    el("p", { text: `Restored v${outcome.version} of ${file.path} as a local edit:` }),
    historyKeys(outcome.changes),
    el("p", {
      className: "muted",
      text: "Review the keys in Repos, then press Push to publish them.",
    }),
  ]);
}
