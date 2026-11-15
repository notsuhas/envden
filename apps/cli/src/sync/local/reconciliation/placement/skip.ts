import type { ILocalState } from "../../../../state/model.ts";

type TTarget = ILocalState["links"][number];

export function targetSkip(links: readonly TTarget[], target: TTarget, approved: boolean) {
  if (!approved) return "unapproved" as const;
  const current = links.find((link) => link.root === target.root && link.path === target.path);
  if (!current) return undefined;
  if (current.localOnly) return "local-only" as const;
  if (current.mode !== target.mode || current.store !== target.store) return "changed" as const;

  return undefined;
}
