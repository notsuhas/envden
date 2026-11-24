import type { TContext } from "../db/context.ts";

export function createApprovers(context: TContext) {
  const { bytes } = context;

  function approver(vault: Uint8Array, device: Uint8Array, now: number): Uint8Array | undefined {
    return bytes(
      "SELECT bytes FROM approvers WHERE vault=? AND device=? AND expires>?",
      vault,
      device,
      now,
    );
  }

  return { approver };
}
