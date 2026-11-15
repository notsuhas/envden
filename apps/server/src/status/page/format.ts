import { format, formatDistanceStrict, formatDuration, intervalToDuration } from "date-fns";
import { TZDate } from "@date-fns/tz";

const units = ["B", "KiB", "MiB", "GiB", "TiB"];

export function formatBytes(bytes: number): string {
  const exponent = Math.min(units.length - 1, Math.floor(Math.log2(Math.max(bytes, 1)) / 10));
  const value = bytes / 1024 ** exponent;

  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

export function formatUptime(seconds: number): string {
  const units = ["days", "hours", "minutes"] as const;

  const text = formatDuration(intervalToDuration({ start: 0, end: seconds * 1000 }), {
    format: [...units],
  });

  return text || "under a minute";
}

export function formatWhen(utc: string, now: number): string {
  const relative = formatDistanceStrict(new Date(utc), now, { addSuffix: true });

  return `${relative} (${format(new TZDate(utc, "UTC"), "yyyy-MM-dd HH:mm")} UTC)`;
}
