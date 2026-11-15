import { formatDistanceStrict } from "date-fns";
import type { TUnlock } from "../model.ts";

const fixed: Record<Exclude<TUnlock["kind"], "until">, string> = {
  never: "never expires",
  locked: "locked — run envden unlock in a terminal",
  unrecorded: "unlocked; expiry not recorded on this device",
  unknown: "unknown; the server is unreachable",
};

export function unlockText(unlock: TUnlock, now: number, date: (ms: number) => string): string {
  if (unlock.kind !== "until") return fixed[unlock.kind];
  if (unlock.until <= now) return fixed.locked;

  return `${date(unlock.until)} (${formatDistanceStrict(unlock.until, now, { addSuffix: true })})`;
}
