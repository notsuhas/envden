import type { TUnlock } from "../model.ts";

const minute = 60000;
const hour = 60 * minute;
const day = 24 * hour;
const relative = new Intl.RelativeTimeFormat("en", { numeric: "always" });

const fixed: Record<Exclude<TUnlock["kind"], "until">, string> = {
  never: "never expires",
  locked: "locked — run envden unlock in a terminal",
  unrecorded: "unlocked; expiry not recorded on this device",
  unknown: "unknown; the server is unreachable",
};

export function unlockText(unlock: TUnlock, now: number, date: (ms: number) => string): string {
  if (unlock.kind !== "until") return fixed[unlock.kind];
  if (unlock.until <= now) return fixed.locked;

  return `${date(unlock.until)} (${relativeTime(unlock.until - now)})`;
}

function relativeTime(left: number) {
  if (left >= day) return relative.format(Math.round(left / day), "day");
  if (left >= hour) return relative.format(Math.round(left / hour), "hour");
  if (left >= minute) return relative.format(Math.round(left / minute), "minute");

  return "in under a minute";
}
