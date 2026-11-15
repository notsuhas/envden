import type { IVersionView, THistoryChanges } from "../../../view/model.ts";
import { el } from "../dom.ts";
import { keyList } from "../keys.ts";

export function historyKeys(changes: THistoryChanges): HTMLElement {
  if (changes === "unknown") return el("span", { className: "muted", text: "changes unknown" });
  if (changes === "unparsed") return el("span", { className: "muted", text: "not parsed" });

  return keyList({ kind: "diff", ...changes });
}

export function versionChanges(version: IVersionView): HTMLElement {
  if (version.kind === "deleted") return el("span", { className: "muted", text: "deleted" });

  if (version.kind === "lost")
    return el("span", { className: "muted", text: "lost in a server repair" });

  if (version.kind === "restored")
    return el("span", { className: "row" }, [
      el("span", { className: "muted", text: "restored by a server repair" }),
      historyKeys(version.changes),
    ]);

  return historyKeys(version.changes);
}
