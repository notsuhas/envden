import { format, formatDistanceStrict } from "date-fns";
import { TZDate } from "@date-fns/tz";

// Times are stored and sent as UTC; people read them relative to now and in their own zone.
export function localTime(utc: string | number, timeZone?: string): string {
  return format(
    timeZone ? new TZDate(new Date(utc).getTime(), timeZone) : new Date(utc),
    "yyyy-MM-dd HH:mm zzz",
  );
}

export function relativeTime(utc: string | number, now: number): string {
  return formatDistanceStrict(new Date(utc), now, { addSuffix: true });
}

export function whenText(utc: string | number, now: number, timeZone?: string): string {
  return `${relativeTime(utc, now)} (${localTime(utc, timeZone)})`;
}
