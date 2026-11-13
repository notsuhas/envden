import { format } from "node:util";
import { sanitizeTerminal } from "./sanitize.ts";

export async function withTerminalErrors<T>(action: () => Promise<T>): Promise<T> {
  const report = console.error;
  console.error = (...values: unknown[]) => report(sanitizeTerminal(format(...values)));

  try {
    return await action();
  } finally {
    console.error = report;
  }
}
