import type { TUnlock } from "../model.ts";

export type TUnlockProbe =
  | { kind: "unlocked"; period: number | null }
  | { kind: "locked" }
  | { kind: "unreachable" };

// The server decides; the expiry recorded at the last unlock, setup or join only adds the date.
export function deriveUnlock(
  recorded: number | null | undefined,
  probe: TUnlockProbe,
  now: number,
): TUnlock {
  if (probe.kind === "locked") return { kind: "locked" };

  if (probe.kind === "unlocked") {
    if (probe.period === null) return { kind: "never" };

    return typeof recorded === "number" && recorded > now
      ? { kind: "until", until: recorded }
      : { kind: "unrecorded" };
  }

  if (recorded === null) return { kind: "never" };
  if (recorded === undefined) return { kind: "unknown" };

  return recorded > now ? { kind: "until", until: recorded } : { kind: "locked" };
}
