import type { TJoinSlot } from "@envden/core/adapters";

export type TJoinRole = "joiner" | "claimer" | "member" | "other";

export type TJoinAction = { kind: "read" | "write"; slot: TJoinSlot } | { kind: "close" };

// The joiner reads the offer and writes the reveal; the claiming member does the opposite.
export function joinSide(
  role: TJoinRole,
  action: TJoinAction,
  claimed: boolean,
): { kind: "allowed" | "denied" } {
  const allowed =
    action.kind === "close"
      ? role === "joiner" || role === "claimer"
      : action.slot === "offer"
        ? action.kind === "read"
          ? role === "joiner"
          : role === "claimer" || (role === "member" && !claimed)
        : action.kind === "read"
          ? role === "claimer"
          : role === "joiner";

  return { kind: allowed ? "allowed" : "denied" };
}
