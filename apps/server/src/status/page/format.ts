import { secondsInDay, secondsInHour, secondsInMinute } from "date-fns/constants";
import { format, formatDistanceStrict, formatDuration } from "date-fns";
import { TZDate } from "@date-fns/tz";
import prettyBytes from "pretty-bytes";

export function formatBytes(bytes: number): string {
  return prettyBytes(bytes, { binary: true });
}

// Total days, never calendar months or years, so a long uptime isn't shown short.
export function formatUptime(seconds: number): string {
  const text = formatDuration({
    days: Math.floor(seconds / secondsInDay),
    hours: Math.floor((seconds % secondsInDay) / secondsInHour),
    minutes: Math.floor((seconds % secondsInHour) / secondsInMinute),
  });

  return text || "under a minute";
}

export function formatWhen(utc: string, now: number): string {
  const relative = formatDistanceStrict(new Date(utc), now, { addSuffix: true });

  return `${relative} (${format(new TZDate(utc, "UTC"), "yyyy-MM-dd HH:mm")} UTC)`;
}
