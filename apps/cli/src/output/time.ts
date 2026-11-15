const PARTS = ["year", "month", "day", "hour", "minute"] as const;

// Times are stored and sent as UTC; people read them in their own zone.
export function localTime(utc: string | number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(new Date(utc));

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  const [year, month, day, hour, minute] = PARTS.map(part);

  return `${year}-${month}-${day} ${hour}:${minute} ${part("timeZoneName")}`;
}
