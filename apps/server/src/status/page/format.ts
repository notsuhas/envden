import { millisecondsInSecond } from "date-fns/constants";
import { format, formatDistanceStrict, formatDuration, intervalToDuration } from "date-fns";
import { TZDate } from "@date-fns/tz";
import prettyBytes from "pretty-bytes";

export function formatBytes(bytes: number): string {
  return prettyBytes(bytes, { binary: true });
}

export function formatUptime(seconds: number): string {
  const units = ["days", "hours", "minutes"] as const;

  const text = formatDuration(
    intervalToDuration({ start: 0, end: seconds * millisecondsInSecond }),
    {
      format: [...units],
    },
  );

  return text || "under a minute";
}

export function formatWhen(utc: string, now: number): string {
  const relative = formatDistanceStrict(new Date(utc), now, { addSuffix: true });

  return `${relative} (${format(new TZDate(utc, "UTC"), "yyyy-MM-dd HH:mm")} UTC)`;
}
