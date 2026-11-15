type TRestoreGate =
  | { kind: "proceed" }
  | { kind: "confirm" }
  | { kind: "refused"; message: string };

// Mirrors resolve: without a terminal, only agent-merge plus --yes may restore.
export function restoreGate(input: {
  yes: boolean;
  interactive: boolean;
  agentMerge: boolean;
}): TRestoreGate {
  if (input.interactive) return { kind: input.yes ? "proceed" : "confirm" };

  if (!input.agentMerge)
    return {
      kind: "refused",
      message: "Restore requires a terminal; use config agent-merge on before --yes",
    };

  return input.yes
    ? { kind: "proceed" }
    : { kind: "refused", message: "Non-interactive restore requires --yes" };
}
