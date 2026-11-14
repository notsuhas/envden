import { format } from "node:util";
import { sanitizeTerminal } from "./sanitize.ts";

export async function withTerminalErrors<T>(action: () => Promise<T>): Promise<T> {
  const log = console.log;
  const info = console.info;
  const table = console.table;
  console.log = (...values: unknown[]) => log(...values.map(sanitizeValue));
  console.info = (...values: unknown[]) => info(...values.map(sanitizeValue));

  console.table = (data: unknown, properties?: string[]) =>
    properties
      ? table(sanitizeValue(data), properties.map(sanitizeTerminal))
      : table(sanitizeValue(data));

  const report = console.error;
  console.error = (...values: unknown[]) => report(sanitizeTerminal(format(...values)));

  try {
    return await action();
  } finally {
    console.error = report;
    console.log = log;
    console.info = info;
    console.table = table;
  }
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeTerminal(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);

  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [sanitizeTerminal(key), sanitizeValue(item)]),
    );

  return value;
}
