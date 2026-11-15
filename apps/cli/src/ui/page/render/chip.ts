import type { TApproval, TFileStatus } from "../../view/model.ts";
import { el } from "./dom.ts";

const tones: Record<TFileStatus | TApproval, string> = {
  "in-sync": "cold",
  "local-only": "idle",
  "local-changes": "warm",
  "remote-changes": "warm",
  "held-back": "alarm",
  missing: "alarm",
  detached: "alarm",
  conflict: "alarm",
  approved: "idle",
  "needs-approval": "warm",
  changed: "alarm",
  unavailable: "alarm",
};

export function chip(value: TFileStatus | TApproval): HTMLSpanElement {
  return el("span", {
    className: "chip",
    text: value.replaceAll("-", " "),
    data: { tone: tones[value] },
  });
}

export function quiet(status: TFileStatus): boolean {
  return status === "in-sync" || status === "local-only";
}
