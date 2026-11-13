import type { TMailboxSlot } from "@envden/core/adapters";

export function mailboxSide(
  owner: boolean,
  write: boolean,
  slot: TMailboxSlot,
): { kind: "allowed" | "denied" } {
  const responder = slot === "KE2";
  const allowed = write ? owner === responder : responder || owner;

  return { kind: allowed ? "allowed" : "denied" };
}
