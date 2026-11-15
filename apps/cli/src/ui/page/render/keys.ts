import type { TKeyChanges } from "../../view/model.ts";
import { el } from "./dom.ts";

export function keyList(keys: TKeyChanges | undefined): HTMLElement {
  if (!keys) return el("span", { className: "muted", text: "-" });

  if (keys.kind === "unparsed")
    return el("span", { className: "muted", text: `not parsed (${keys.reason})` });

  const items = [
    ...keys.added.map((key) => el("span", { className: "key-added", text: `+ ${key}` })),
    ...keys.removed.map((key) => el("span", { className: "key-removed", text: `- ${key}` })),
    ...keys.changed.map((key) => el("span", { text: `~ ${key}` })),
  ];

  if (!items.length) return el("span", { className: "muted", text: "layout only" });

  return el("span", { className: "keys" }, items);
}
