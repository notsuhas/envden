export type TFileState =
  | "local-only"
  | "conflict"
  | "detached"
  | "held-back"
  | "missing"
  | "diverged"
  | "changed"
  | "remote"
  | "in-sync";

interface IFileFacts {
  localOnly: boolean;
  conflict: boolean;
  placement: "linked" | "relinkable" | "detached" | "missing";
  heldBack: boolean;
  changed: boolean;
  remote: boolean;
}

export function deriveFileState(facts: IFileFacts): TFileState {
  if (facts.localOnly) return "local-only";
  if (facts.conflict) return "conflict";
  if (facts.placement === "detached") return "detached";
  if (facts.heldBack) return "held-back";
  if (facts.placement === "missing") return facts.remote ? "remote" : "missing";
  if (facts.changed && facts.remote) return "diverged";
  if (facts.changed) return "changed";

  return facts.remote ? "remote" : "in-sync";
}
